import type { MessageContent, Thread } from '@textshq/platform-sdk'
import { WebClient } from '@slack/web-api'
import got from 'got'
import { promises as fs } from 'fs'
import type { CookieJar } from 'tough-cookie'

import { extractRichElements, mapParticipant, mapProfile } from '../mappers'
import { NOT_USED_SLACK_URL } from './constants'
import { EMOTES } from '../emotes'

export default class SlackAPI {
  cookieJar: CookieJar

  userToken: string

  webClient: WebClient

  emojis: any[]

  setLoginState = async (cookieJar: CookieJar, clientToken: string = '') => {
    if (!cookieJar && !clientToken) throw TypeError()
    this.cookieJar = cookieJar || null

    const token = clientToken || await this.getClientToken()

    const client = new WebClient(token)

    this.userToken = token
    this.webClient = client
  }

  getClientToken = async () => {
    const { body: workspacesBody } = await got(NOT_USED_SLACK_URL, { cookieJar: this.cookieJar })
    const filteredSlackWorkspaces = [NOT_USED_SLACK_URL, 'dev.slack.com']
    const alreadyConnectedUrls = workspacesBody?.match(/([a-zA-Z0-9\-]+\.slack\.com)/g).filter((url: string) => !filteredSlackWorkspaces.includes(url)) || []
    // FIXME: this needs to be fixed, we need to get the one the user has already selected
    // on the browser login
    const firstWorkspace = alreadyConnectedUrls[0] || ''
    const { body: emojisBody } = await got(`https://${firstWorkspace}/customize/emoji`, { cookieJar: this.cookieJar })
    const token = emojisBody?.match(/(xox[a-zA-Z]-[a-zA-Z0-9-]+)/g)[0] || ''

    return token
  }

  setEmojis = async () => {
    this.emojis = (await this.webClient.emoji.list()).emoji as any[]
  }

  getCurrentUser = async () => {
    const auth: any = await this.webClient.auth.test()
    const user: any = await this.webClient.users.profile.get()
    const team = await this.webClient.team.info()

    user.profile.id = auth.user_id

    return { ...user, ...(team || {}) }
  }

  getThreads = async (cursor = undefined) => {
    const currentUser = await this.getCurrentUser()

    const response = await this.webClient.conversations.list({
      // This is done this way because if you're a guest on a workspace you won't
      // be able to get public_channels and will raise an error. This should be
      // refactored in a future version and maybe get the scopes available for the user.
      types: currentUser?.profile?.guest_invited_by ? 'im' : 'im,public_channel',
      limit: 10,
      cursor: cursor || undefined,
      exclude_archived: true,
    })

    const privateMessages = (response.channels as any[]).filter(({ is_im }: { is_im: boolean }) => is_im)
    const publicChannels = (response.channels as any[]).filter(({ is_channel, is_member }: { is_channel: boolean; is_member: boolean }) => is_channel && is_member)

    for (const channel of publicChannels) {
      const { id } = channel
      const threadInfo = await this.webClient.conversations.info({ channel: id })
      const { channel: channelInfo } = threadInfo as any || {}
      // TODO: Add pagination, this method by default limits the number of participants to 100
      const participantsIds = await this.webClient.conversations.members({ channel: id }) || { members: [] }
      const promises = (participantsIds?.members as any[]).map((userId: string) => this.getParticipantProfile(userId))

      channel.unread = channelInfo?.unread_count || undefined
      channel.messages = [channelInfo?.latest].filter(x => x?.ts) || []
      channel.participants = await Promise.all(promises).catch(() => null) || []
    }

    for (const thread of privateMessages as any[]) {
      const { id, user: userId } = thread
      const user = await this.getParticipantProfile(userId)
      const threadInfo = await this.webClient.conversations.info({ channel: id })
      const { channel } = threadInfo as any || {}

      thread.unread = channel?.unread_count || undefined
      thread.messages = [channel?.latest].filter(x => x?.ts) || []
      thread.participants = [user, currentUser] || []
    }

    response.channels = [...privateMessages, ...publicChannels]
    return response
  }

  messageReplies = async (threadId: string, messageId: string): Promise<unknown[]> => {
    try {
      const response = await this.webClient.conversations.replies({ channel: threadId, ts: messageId })
      return response?.messages as unknown[] || []
    } catch (error) {
      return []
    }
  }

  getMessages = async (threadId: string, limit: number = 20, latest = undefined) => {
    const response = await this.webClient.conversations.history({
      channel: threadId,
      limit,
      latest,
    })

    const { messages = [] } = response
    let replies = []

    for (const message of messages as any[]) {
      const { blocks, ts, reply_count } = message
      const richElements = extractRichElements(blocks)

      if (reply_count) replies = [...replies, ...(await this.messageReplies(threadId, ts) || [])]

      for (const element of richElements) {
        if (element.type === 'user') element.profile = (await this.getParticipantProfile(element.user_id))?.profile
      }
    }

    const aux = [...(messages as any[]), ...replies]
    response.messages = [...new Map(aux.map(item => [item.ts, item])).values()]
    return response
  }

  getParticipantProfile = async (userId: string) => {
    const user: any = await this.webClient.users.profile.get({ user: userId })
    user.profile.id = userId
    return user
  }

  searchUsers = async (typed: string) => {
    const allUsers = await this.webClient.users.list({ limit: 100 })
    const { members } = allUsers

    return (members as any)
      .filter(member => member.name.toLowerCase().includes(typed.toLowerCase()))
      .map(mapProfile)
  }

  sendMessage = async (channel: string, content: MessageContent) => {
    const { text } = content

    let buffer
    let file
    let attachments

    if (content.mimeType) {
      buffer = content.fileBuffer || await fs.readFile(content.filePath) || null

      file = await this.webClient.files.upload({
        file: buffer,
        channels: channel,
        title: content.fileName,
        filename: content.fileName,
      }) || {}

      attachments = [(file as any).file] || []
    }

    const res = await this.webClient.chat.postMessage({ channel, text, attachments })
    return res.message
  }

  deleteMessage = async (channel: string, messageID: string) => this.webClient.chat.delete({ channel, ts: messageID })

  createThread = async (userIDs: string[]): Promise<Thread> => {
    const res = await this.webClient.conversations.open({ users: userIDs.join(','), return_im: true })
    const { channel } = res as any

    const promises = userIDs.map(user => this.webClient.users.profile.get({ user }))
    const profiles = (await Promise.all(promises)).map(mapParticipant)

    return {
      id: channel.id,
      title: profiles.map(user => user.username).join(', '),
      type: userIDs.length > 1 ? 'group' : 'single',
      participants: { items: profiles, hasMore: false },
      messages: { items: [], hasMore: false },
      timestamp: new Date(channel?.created) || new Date(),
      isUnread: false,
      isReadOnly: false,
    }
  }

  fetchStream = ({ headers = {}, ...rest }) => {
    if (!this.cookieJar) throw new Error('Slack cookie jar not found')

    return got.stream({
      throwHttpErrors: false,
      cookieJar: this.cookieJar,
      ...rest,
    })
  }

  sendReadReceipt = async (threadID: string, messageID: string) => {
    await this.webClient.conversations.mark({ channel: threadID, ts: messageID })
  }

  addReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    const emoji = EMOTES.find(({ unicode }) => unicode === reactionKey)?.emoji?.replace(/:/g, '')
    await this.webClient.reactions.add({ name: emoji, channel: threadID, timestamp: messageID })
  }

  removeReaction = async (threadID: string, messageID: string, reactionKey: string) => {
    const emoji = EMOTES.find(({ unicode }) => unicode === reactionKey)?.emoji?.replace(/:/g, '')
    await this.webClient.reactions.remove({ name: emoji, channel: threadID, timestamp: messageID })
  }
}
