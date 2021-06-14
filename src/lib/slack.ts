import { WebClient } from '@slack/web-api'
import bluebird from 'bluebird'
import { promises as fs } from 'fs'
import { MessageContent, Thread, texts, FetchOptions, OnServerEventCallback, ServerEventType, Participant } from '@textshq/platform-sdk'
import { uniqBy } from 'lodash'
import type { CookieJar } from 'tough-cookie'

import { extractRichElements, mapParticipant, mapProfile } from '../mappers'
import { NOT_USED_SLACK_URL } from './constants'
import { EMOTES } from '../emotes'
import { MENTION_REGEX } from '../constants'
import type { ThreadType } from '../api'

export default class SlackAPI {
  cookieJar: CookieJar

  onEvent: OnServerEventCallback

  userToken: string

  webClient: WebClient

  emojis: any[]

  workspaceUsers: Record<string, unknown> = {}

  setLoginState = async (cookieJar: CookieJar, clientToken: string = '') => {
    if (!cookieJar && !clientToken) throw TypeError()
    this.cookieJar = cookieJar || null

    const token = clientToken || await this.getClientToken()

    const client = new WebClient(token)

    this.userToken = token
    this.webClient = client
  }

  setOnEvent = (onEvent: OnServerEventCallback) => {
    this.onEvent = onEvent
  }

  getClientToken = async () => {
    const { body: workspacesBodyBuffer } = await texts.fetch(NOT_USED_SLACK_URL, { cookieJar: this.cookieJar })
    const workspacesBody = workspacesBodyBuffer.toString('utf-8')
    const filteredSlackWorkspaces = [NOT_USED_SLACK_URL, 'dev.slack.com']
    const alreadyConnectedUrls = workspacesBody?.match(/([a-zA-Z0-9-]+\.slack\.com)/g).filter((url: string) => !filteredSlackWorkspaces.includes(url)) || []
    // Since the browser is initialized with fresh and new cookies and cache, the wanted workspace would be
    // in the first place
    const firstWorkspace = alreadyConnectedUrls[0] || ''
    const { body: emojisBodyBuffer } = await texts.fetch(`https://${firstWorkspace}/customize/emoji`, { cookieJar: this.cookieJar })
    const emojisBody = emojisBodyBuffer.toString('utf-8')
    const token = emojisBody?.match(/(xox[a-zA-Z]-[a-zA-Z0-9-]+)/g)[0] || ''

    return token
  }

  setEmojis = async () => {
    this.emojis = (await this.webClient.emoji.list()).emoji as any[]
  }

  getCurrentUser = async () => {
    const auth = await this.webClient.auth.test()
    const [user, team] = await Promise.all([
      this.webClient.users.profile.get(),
      this.webClient.team.info(),
    ])
    // @ts-expect-error
    user.profile.id = auth.user_id

    return { ...user, ...(team || {}) }
  }

  loadPublicChannel = async (channel: any) => {
    const { id } = channel
    const threadInfo = await this.webClient.conversations.info({ channel: id })

    const { channel: channelInfo } = threadInfo as any || {}
    if (channelInfo?.latest?.text) channelInfo.latest.text = await this.loadMentions(channelInfo?.latest?.text)
    // As we don't have the latest activity, we can use different fields to get the thread timestamp
    channel.timestamp = new Date(Number(channelInfo?.last_read) * 1000) || new Date(channelInfo?.created) || undefined
    channel.unread = channelInfo?.unread_count || undefined
    channel.messages = [channelInfo?.latest].filter(x => x?.ts) || []
    channel.participants = []
  }

  loadPrivateMessage = async (thread: any, currentUser: any) => {
    const { id, user: userId } = thread
    const [user, threadInfo] = await Promise.all([
      this.getParticipantProfile(userId),
      this.webClient.conversations.info({ channel: id }),
    ])

    const { channel } = threadInfo as any || {}
    if (channel?.latest?.text) channel.latest.text = await this.loadMentions(channel?.latest?.text)

    thread.timestamp = new Date(Number(channel?.last_read) * 1000) || new Date(channel?.created) || undefined
    thread.unread = channel?.unread_count || undefined
    thread.messages = [channel?.latest].filter(x => x?.ts) || []
    thread.participants = [user, currentUser] || []
  }

  getThreads = async (cursor = undefined, threadTypes: ThreadType[] = []) => {
    const currentUser = await this.getCurrentUser()
    const types = threadTypes.map(t => {
      if (t === 'dm') return 'im'
      if (t === 'channel') return 'public_channel'
      return undefined
    }).join(',')

    const response = await this.webClient.conversations.list({
      // This is done this way because if you're a guest on a workspace you won't
      // be able to get public_channels and will raise an error. This should be
      // refactored in a future version and maybe get the scopes available for the user.
      // @ts-expect-error
      types: currentUser?.profile?.guest_invited_by ? 'im' : types,
      limit: 10,
      cursor: cursor || undefined,
      exclude_archived: true,
    })

    const privateMessages = threadTypes.includes('dm') ? (response.channels as any[]).filter(({ is_im }: { is_im: boolean }) => is_im) : []
    const publicChannels = threadTypes.includes('channel') ? (response.channels as any[]).filter(({ is_channel, is_member }: { is_channel: boolean; is_member: boolean }) => is_channel && is_member) : []

    await bluebird.map(publicChannels, this.loadPublicChannel)
    await bluebird.map(privateMessages, t => this.loadPrivateMessage(t, currentUser))

    response.channels = [...privateMessages, ...publicChannels]
    return response
  }

  messageReplies = async (threadId: string, messageId: string): Promise<unknown[]> => {
    try {
      const response = await this.webClient.conversations.replies({ channel: threadId, ts: messageId })
      return response?.messages as unknown[] || []
    } catch (error) {
      texts.error(error)
      return []
    }
  }

  loadMentions = async (text: string): Promise<string> => {
    const matches = text?.match(MENTION_REGEX)
    if (!matches) return text

    let finalText = text

    for (const mentionedUser of matches || []) {
      const mentionedUserId = mentionedUser.replace('<@', '').replace('>', '')
      const foundUserProfile = (await this.getParticipantProfile(mentionedUserId))?.profile || { display_name: mentionedUser }
      finalText = finalText.replace(mentionedUser, foundUserProfile?.display_name || foundUserProfile?.real_name)
    }

    return finalText
  }

  getMessages = async (threadId: string, limit: number = 20, latest = undefined) => {
    const response = await this.webClient.conversations.history({
      channel: threadId,
      limit,
      latest,
    })

    const { messages = [] } = response
    let replies = []
    const participants: Participant[] = []

    const loadMessage = async (message: any) => {
      const { blocks, ts, reply_count, text, user: messageUser } = message
      const richElements = extractRichElements(blocks)

      const newReplies = await this.messageReplies(threadId, ts) || []
      if (reply_count) replies = [...replies, ...newReplies]

      await bluebird.map(richElements, async element => {
        if (element.type !== 'user') return
        element.profile = (await this.getParticipantProfile(element.user_id))?.profile
      })

      if (typeof text === 'string') message.text = await this.loadMentions(text)

      const sharedParticipant = message?.user_profile ? { profile: { ...message.user_profile, id: `${message.user_profile?.team}-${message.user_profile?.avatar_hash}` } } : undefined
      // B01 === "Slackbot" but slack bot isn't a bot on slack so normal profile needs to be fetched instead the bot
      const user = sharedParticipant || (message?.bot_id && message?.bot_id !== 'B01' ? await this.getParticipantBot(message.bot_id) : await this.getParticipantProfile(messageUser))

      if (!user?.profile?.id) return
      if (message.bot_id) message.user = user.profile.id

      const p = mapParticipant(user)
      if (p) participants.push(p)
    }

    await bluebird.map(messages, loadMessage)

    const aux = [...(messages as any[]), ...replies]
    response.messages = uniqBy(aux, 'ts')

    if (participants.length > 0) {
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        mutationType: 'upsert',
        objectName: 'participant',
        objectIDs: { threadID: threadId },
        entries: participants,
      }])
    }

    return response
  }

  getParticipantProfile = async (userId: string) => {
    if (this.workspaceUsers[userId]) return this.workspaceUsers[userId]
    // TODO: Handle error when user is from a different team
    const user: any = await this.webClient.users.profile.get({ user: userId }).catch(_ => ({}))
    if (!user.profile) return {}

    user.profile.id = userId
    this.workspaceUsers[userId] = user
    return user
  }

  getParticipantBot = async (botId: string) => {
    if (this.workspaceUsers[botId]) return this.workspaceUsers[botId]

    const bot: any = await this.webClient.bots.info({ bot: botId })

    const keys = Object.keys(this.workspaceUsers)
    const foundKey = keys.find(key => (this.workspaceUsers[key] as any)?.profile?.api_app_id === bot.bot.app_id)
    const user: any = this.workspaceUsers[foundKey] || {}

    const participant = { profile: { ...bot.bot, ...(user?.profile || {}), id: bot.bot.app_id } }
    this.workspaceUsers[botId] = participant
    return participant
  }

  searchUsers = async (typed: string) => {
    const allUsers = await this.webClient.users.list({ limit: 100 })
    const { members: _members } = allUsers
    const members = _members as any[]

    if (!typed) return members.map(mapProfile)
    return members
      .filter(member => member.name.toLowerCase().includes(typed.toLowerCase()))
      .map(mapProfile)
  }

  sendMessage = async (channel: string, content: MessageContent) => {
    const { text } = content

    let buffer: Buffer
    let attachments: any[]
    let file

    if (content.mimeType) {
      buffer = content.fileBuffer || await fs.readFile(content.filePath)

      if (buffer) {
        file = await this.webClient.files.upload({
          file: buffer,
          channels: channel,
          title: content.fileName,
          filename: content.fileName,
        }) || {}
      }

      attachments = [file.file] || []
    }

    const res = await this.webClient.chat.postMessage({ channel, text, attachments })
    return res.message
  }

  deleteMessage = async (channel: string, messageID: string) =>
    this.webClient.chat.delete({ channel, ts: messageID })

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

  fetchStream = (url: string, opts?: FetchOptions) => {
    if (!this.cookieJar) throw new Error('Slack cookie jar not found')

    return texts.fetchStream(url, {
      cookieJar: this.cookieJar,
      ...opts,
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

  editMessage = async (threadID: string, messageID: string, content: MessageContent): Promise<boolean> => {
    let buffer: Buffer
    let attachments: any[]
    let file

    if (content.mimeType) {
      buffer = content.fileBuffer || await fs.readFile(content.filePath)

      if (buffer) {
        file = await this.webClient.files.upload({
          file: buffer,
          channels: threadID,
          title: content.fileName,
          filename: content.fileName,
        }) || {}
      }

      attachments = [file.file] || []
    }

    await this.webClient.chat.update({ channel: threadID, ts: messageID, text: content.text, attachments })
    return true
  }
}
