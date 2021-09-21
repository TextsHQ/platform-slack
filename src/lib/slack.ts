import { MessageContent, Thread, texts, FetchOptions, OnServerEventCallback, ServerEventType, Participant, ReAuthError } from '@textshq/platform-sdk'
import { WebClient } from '@slack/web-api'
import { promises as fs } from 'fs'
import bluebird from 'bluebird'
import { uniqBy } from 'lodash'
import type { CookieJar } from 'tough-cookie'

import { extractRichElements, mapParticipant, mapProfile } from '../mappers'
import { emojiToShortcode } from '../text-attributes'
import { NOT_USED_SLACK_URL } from './constants'
import { MENTION_REGEX } from '../constants'
import type { ThreadType } from '../api'
import type { Member } from '@slack/web-api/dist/response/UsersListResponse'

export default class SlackAPI {
  cookieJar: CookieJar

  onEvent: OnServerEventCallback

  userToken: string

  webClient: WebClient

  customEmojis: Record<string, string>

  workspaceUsers: Record<string, any> = {}

  setLoginState = async (cookieJar: CookieJar, clientToken = '') => {
    if (!cookieJar && !clientToken) throw TypeError()
    this.cookieJar = cookieJar || null

    const token = clientToken || await this.getClientToken()

    const cookie = await cookieJar.getCookieString('https://slack.com')
    const client = new WebClient(token, { headers: { cookie } })

    this.userToken = token
    this.webClient = client
  }

  getCurrentWorkspace = async () => {
    const { body: workspacesBodyBuffer } = await texts.fetch(NOT_USED_SLACK_URL, { cookieJar: this.cookieJar })
    const workspacesBody = workspacesBodyBuffer.toString('utf-8')
    const filteredSlackWorkspaces = [NOT_USED_SLACK_URL, 'dev.slack.com']
    const alreadyConnectedUrls = workspacesBody?.match(/([a-zA-Z0-9-]+\.slack\.com)/g).filter((url: string) => !filteredSlackWorkspaces.includes(url)) || []
    // If there's no already connected Slack workspace (on the browser) this will raise an error.
    // TODO: Add error message
    if (!alreadyConnectedUrls || !alreadyConnectedUrls?.length) throw new ReAuthError()
    // Since the browser is initialized with fresh and new cookies and cache, the wanted workspace would be
    // in the first place
    const firstWorkspace = alreadyConnectedUrls[0] || ''
    return firstWorkspace
  }

  getClientToken = async () => {
    const firstWorkspace = await this.getCurrentWorkspace()

    const { body: emojisBodyBuffer } = await texts.fetch(`https://${firstWorkspace}/customize/emoji`, { cookieJar: this.cookieJar })
    const emojisBody = emojisBodyBuffer.toString('utf-8')
    const tokens = emojisBody?.match(/(xox[a-zA-Z]-[a-zA-Z0-9-]+)/g)

    if (!emojisBody || !tokens?.length) throw new ReAuthError('There was an unknown error trying to login to this workspace')

    const clientToken = tokens[0]
    return clientToken
  }

  setCustomEmojis = async () => {
    const res = await this.webClient.emoji.list()
    // @ts-expect-error res.emoji's type is incorrect
    this.customEmojis = res.emoji
  }

  getCurrentUser = async () => {
    const [auth, user, team] = await Promise.all([
      this.webClient.auth.test(),
      this.webClient.users.profile.get(),
      this.webClient.team.info(),
    ])

    return { auth, user: user.profile, team: team.team }
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
    // This filter is because sometimes the latest message hasn't timestamp and can be a response from a thread
    // so this way we filter only messages that aren't thread responses
    thread.messages = [channel?.latest].filter(x => x?.ts && !x?.thread_ts) || []
    thread.participants = (thread?.is_im || thread?.is_shared) ? [user] : []
    // For some reason groups come with the name 'mpdm-firstuser--seconduser--thirduser-1'
    thread.name = thread?.is_mpim ? thread?.name.replace('mpdm-', '').replace('-1', '').split('--').join(', ') : ''
  }

  getThreads = async (cursor = undefined, threadTypes: ThreadType[] = []) => {
    const currentUser = await this.getCurrentUser()
    let response: any = { channels: [] }
    // This is done this way because Slack's API doesn't support all requests for guests
    // for those cases we'll use some deprecated endpoints (such as im, mpim and channels)
    // but this will allow us to retrieve all the data for guest users.
    // In case user is not a guest we'll use the latest method suggested by Slack team
    // conversation
    // We cannot use users.conversations neither (this could change in a future)
    // @see https://api.slack.com/docs/conversations-api
    // @see https://api.slack.com/methods/channels.list
    // @ts-expect-error
    if (currentUser?.profile?.guest_invited_by) {
      if (threadTypes.includes('dm')) {
        const { ims = [], response_metadata: imMetadata } = (await this.webClient.im.list()) as any
        const { groups = [], response_metadata: groupsMetadata } = (await this.webClient.mpim.list()) as any
        response.channels = [...response.channels, ...groups, ...ims]
        response.response_metadata = groupsMetadata || imMetadata || {}
      }

      if (threadTypes.includes('channel')) {
        const promises = [this.webClient.channels.list(), this.webClient.conversations.list()]
        const results = await Promise.all(promises)

        response.channels = [...response.channels, ...(results[0] as any).channels, ...(results[1] as any).channels]
        response.response_metadata = results[0].response_metadata || results[1].response_metadata || response.response_metadata || {}
      }
    } else {
      const types = threadTypes.map(t => {
        if (t === 'dm') return ['mpim', 'im'].join(',')
        if (t === 'channel') return ['public_channel', 'private_channel'].join(',')
        return undefined
      }).join(',')

      response = await this.webClient.conversations.list({
        types,
        limit: 10,
        cursor: cursor || undefined,
        exclude_archived: true,
      })
    }

    const privateMessages = threadTypes.includes('dm')
      ? (response.channels as any[]).filter(({ is_im, is_mpim }: { is_im: boolean, is_mpim?: boolean }) => is_im || is_mpim)
      : []

    const publicChannels = threadTypes.includes('channel')
      ? (response.channels as any[]).filter(({ is_channel, is_member }: { is_channel: boolean, is_member: boolean }) => is_channel && is_member)
      : []

    await bluebird.map(publicChannels, this.loadPublicChannel)
    await bluebird.map(privateMessages, this.loadPrivateMessage)

    response.channels = [...privateMessages, ...publicChannels]
    return response
  }

  messageReplies = (channel: string, ts: string) =>
    this.webClient.conversations.replies({ channel, ts })

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

  getMessages = async (threadID: string, limit = 20, latest = undefined) => {
    const response = await this.webClient.conversations.history({
      channel: threadID,
      limit,
      latest,
    })

    const { messages = [] } = response
    const participantsMap: { [id: string]: Participant } = {}

    const loadMessage = async (message: any) => {
      const { blocks, text, user: messageUser } = message
      const richElements = extractRichElements(blocks)

      await bluebird.map(richElements, async element => {
        if (element.type !== 'user') return
        element.profile = (await this.getParticipantProfile(element.user_id))?.profile
      })

      if (typeof text === 'string') message.text = await this.loadMentions(text)

      const sharedParticipant = message?.user_profile
        ? { profile: message.user_profile }
        : undefined
      // B01 === "Slackbot" but slack bot isn't a bot on slack so normal profile needs to be fetched instead the bot
      const user = sharedParticipant || (message?.bot_id && message?.bot_id !== 'B01' && !message?.user ? await this.getParticipantBot(message.bot_id) : await this.getParticipantProfile(messageUser))

      if (!user?.profile?.id) return
      if (message.bot_id) message.user = user.profile.id

      const p = mapParticipant(user)
      if (!participantsMap[p.id]) participantsMap[p.id] = p
    }

    await bluebird.map(messages, loadMessage)

    response.messages = uniqBy(messages, 'ts')

    const participants = Object.values(participantsMap)
    if (participants.length > 0) {
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        mutationType: 'upsert',
        objectName: 'participant',
        objectIDs: { threadID },
        entries: participants,
      }])
    }

    return response
  }

  getParticipantProfile = async (userId: string) => {
    if (this.workspaceUsers[userId]) return this.workspaceUsers[userId]

    const user: any = await this.webClient.users.profile
      .get({ user: userId })
      .catch(async () => {
        // Usually this is when the user is from another team, but this returns the user information
        // instead of the full profile
        // @see https://api.slack.com/methods/users.info
        const info = await this.webClient.users.info({ user: userId })
        return info.user
      })

    if (!user.profile) return {}

    user.profile.id = userId
    this.workspaceUsers[userId] = user
    return user
  }

  getParticipantBot = async (botId: string) => {
    if (this.workspaceUsers[botId]) return this.workspaceUsers[botId]

    const bot = await this.webClient.bots.info({ bot: botId })

    const keys = Object.keys(this.workspaceUsers)
    const foundKey = keys.find(key => this.workspaceUsers[key]?.profile?.api_app_id === bot.bot.app_id)
    const user = this.workspaceUsers[foundKey] || {}

    const participant = { profile: { ...bot.bot, ...(user?.profile || {}), id: bot.bot.app_id } }
    this.workspaceUsers[botId] = participant
    return participant
  }

  searchUsers = async (typed: string) => {
    const allUsers = await this.webClient.users.list({ limit: 100 })
    const { members, response_metadata } = allUsers

    if (!typed) return members.map(mapProfile)

    const filterMembers = (member: Member) => {
      const names = [member.name, member.real_name]
      return names.some(name => name?.toLowerCase().includes(typed.toLowerCase()))
    }
    // Slack doesn't have a "search" users method and the "list" users is limited to 100. So
    // this way it'll "keep searching" until it reaches the end of the list or finds members.
    // The `users.list` method is cached on Slack's side
    // @see https://api.slack.com/methods/users.list#responses
    let filteredMembers = members.filter(filterMembers)
    let nextCursor = response_metadata.next_cursor

    while (!filteredMembers?.length && nextCursor) {
      const moreMembers = await this.webClient.users.list({ limit: 100, cursor: nextCursor || undefined })
      filteredMembers = moreMembers?.members?.filter(filterMembers) || []
      nextCursor = moreMembers?.response_metadata?.next_cursor || ''
    }

    return filteredMembers.map(mapProfile)
  }

  sendMessage = async (channel: string, thread_ts: string, content: MessageContent) => {
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
          thread_ts,
          title: content.fileName,
          filename: content.fileName,
        }) || {}
      }

      attachments = [file.file] || []
    }

    const res = await this.webClient.chat.postMessage({ channel, thread_ts, text, attachments })
    return res.message
  }

  editMessage = async (channel: string, ts: string, thread_ts: string, text: string): Promise<boolean> => {
    const res = await this.webClient.chat.update({ channel, ts, thread_ts, text })
    return res.ok
  }

  deleteMessage = async (channel: string, messageID: string) =>
    this.webClient.chat.delete({ channel, ts: messageID })

  createThread = async (userIDs: string[]): Promise<Thread> => {
    const res = await this.webClient.conversations.open({ users: userIDs.join(','), return_im: true })
    const { channel } = res

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

  addReaction = async (channel: string, timestamp: string, reactionKey: string) => {
    const name = emojiToShortcode(reactionKey) || reactionKey
    await this.webClient.reactions.add({ name, channel, timestamp })
  }

  removeReaction = async (channel: string, timestamp: string, reactionKey: string) => {
    const name = emojiToShortcode(reactionKey) || reactionKey
    await this.webClient.reactions.remove({ name, channel, timestamp })
  }
}
