import { MessageContent, Thread, texts, FetchOptions, Participant, ActivityType } from '@textshq/platform-sdk'
import { ConversationsListResponse, FilesUploadResponse, WebClient } from '@slack/web-api'
import { promises as fs } from 'fs'
import { uniqBy, memoize } from 'lodash'
import type { File } from '@slack/web-api/dist/response/FilesUploadResponse'
import type { Member } from '@slack/web-api/dist/response/UsersListResponse'
import type { CookieJar } from 'tough-cookie'

import type { User } from '@slack/web-api/dist/response/UsersInfoResponse'
import { extractRichElements, mapParticipant, mapProfile } from '../mappers'
import { emojiToShortcode } from '../text-attributes'
import { MENTION_REGEX } from '../constants'
import { textsTime } from '../util'
import type { ThreadType } from '../api'
import type { CustomInfoChannel, CustomListChannel } from '../types'

export default class SlackAPI {
  cookieJar: CookieJar

  userToken: string

  webClient: WebClient

  customEmojis: Record<string, string>

  currentUser?: { auth: any, user: any, team: any }

  private workspaceUsers: Record<string, any> = {}

  private httpClient = texts.createHttpClient()

  private initialMutedChannels = new Set<string>()

  init = async (clientToken: string) => {
    const timer = textsTime('slack.init')
    const token = clientToken || await this.getClientToken()

    const cookie = await this.cookieJar.getCookieString('https://slack.com')
    const client = new WebClient(token, { headers: { cookie }, maxRequestConcurrency: 20 })

    this.userToken = token
    this.webClient = client
    /**
     * Get user all user preferences to get all the muted channels.
     *
     * @description
     *  Slack's WebClient doesn't implement the 'users.prefs.get' method since they're
     *  changing all their clients (not APIs) so this is not implemented yet
     *  This is cached on Slack's side so it won't take too much time to get a
     *  response.
     *
     * @see https://github.com/IPA-CyberLab/IPA-DN-Cores/blob/master/Cores.NET/Cores.Basic/Json/WebApi/ClientApi/SlackApi.cs#L386-L393
     * @see https://github.com/ErikKalkoken/slackApiDoc/blob/master/users.prefs.get.md
     */
    const res = await this.webClient.apiCall('users.prefs.get', {
      token: this.webClient.token,
    })

    // @ts-expect-error this is not typed on Slack's WebClient
    const mutedChannels: string[] = res?.prefs?.muted_channels?.split(',')
    this.initialMutedChannels = new Set([...mutedChannels])

    timer.timeEnd()
  }

  getMutedChannels = () => this.initialMutedChannels

  fetchHTML = async (url: string) => {
    const { body: html } = await this.httpClient.requestAsString(url, { cookieJar: this.cookieJar, headers: { 'User-Agent': texts.constants.USER_AGENT } })
    if (html.includes('"is_unsupported_webclient_browser":true')) console.log('slack unsupported browser issue', url)
    return html
  }

  getFirstTeamURL = async () => {
    const html = await this.fetchHTML('https://app.slack.com/')
    // TD.boot_data.team_url = "https:\/\/texts-co.slack.com\/";
    const [, domain] = html?.match(/TD\.boot_data\.team_url = (.+?);/) || []
    if (!domain) throw Error('Could not find team URL')
    return JSON.parse(domain) // 'https://texts-co.slack.com/'
  }

  getClientToken = async () => {
    const teamURL = await this.getFirstTeamURL()

    for (const pathname of ['customize/emoji', 'home']) {
      texts.log('fetching', teamURL + pathname)
      const html = await this.fetchHTML(teamURL + pathname)
      // "api_token":"xoxc-2837734959632-2807131363654-1044634777490-836bed83bf8aa7ebcaf06a70df3df6ec7153d219003a75f2dce10db1fc1db50f"
      const [, token] = html?.match(/"api_token":"(.+?)"/) || []
      if (token) return token
    }

    throw new Error('Unable to find API token')
  }

  setCustomEmojis = async () => {
    const res = await this.webClient.emoji.list()
    this.customEmojis = res.emoji
  }

  getCurrentUser = async () => {
    if (this.currentUser) return this.currentUser

    const [auth, user, team] = await Promise.all([
      this.webClient.auth.test(),
      this.webClient.users.profile.get(),
      this.webClient.team.info(),
    ])

    this.currentUser = {
      auth,
      user: user.profile,
      team: team.team,
    }

    return this.currentUser
  }

  loadAll = async (channels: CustomListChannel[], threadTypes: string | string[]) => {
    const ch: Promise<CustomListChannel>[] = []
    if (threadTypes.includes('channel')) ch.push(...channels.filter(c => c.is_channel && c.is_member).map(c => this.loadPublicChannel(c)))
    if (threadTypes.includes('dm')) ch.push(...channels.filter(c => c.is_im || c.is_mpim).map(c => this.loadPrivateMessage(c)))
    return Promise.all(ch)
  }

  loadPublicChannel = async (channel: CustomListChannel): Promise<CustomListChannel> => {
    const threadInfo = await this.webClient.conversations.info({ channel: channel.id })
    const channelInfo = threadInfo.channel as CustomInfoChannel
    if (!channelInfo) {
      texts.error(`No conversations.info ${channel.id}`)
    } else {
      if (channelInfo.latest?.text) channelInfo.latest.text = await this.loadMentions(channelInfo.latest.text)
      const updatedChannel: CustomListChannel = {
        ...channel,
        channelInfo: { ...channelInfo, participants: [] },
      }
      return updatedChannel
    }
  }

  loadPrivateMessage = async (channel: CustomListChannel): Promise<CustomListChannel> => {
    const { id, user: userId } = channel

    const threadInfo = await this.webClient.conversations.info({ channel: id })
    if (!threadInfo) {
      texts.error(`No conversations.info ${channel.id}`)
    }
    const participants = threadInfo.channel.is_im ? [await this.getParticipantProfile(userId)] : []
    const updatedChannel: CustomListChannel = {
      ...channel,
      channelInfo: { ...threadInfo?.channel, participants },
    }
    return updatedChannel
  }

  getThreadsNonPaginated = async (threadTypes: ThreadType[] = [], getMessages = true) => {
    const allThreads: CustomListChannel[] = []
    // https://api.slack.com/docs/pagination#cursors
    let cursor: string
    do {
      const { channels, response_metadata } = await this.getThreads(cursor, threadTypes, 1000)
      allThreads.push(...channels)
      cursor = response_metadata?.next_cursor
    } while (cursor)
    if (getMessages) {
      return Promise.all(allThreads.map(async (t): Promise<CustomListChannel> => {
        const messages = await this.getMessages(t.id, 20)
        return {
          ...t,
          messsages: messages.response.messages,
        }
      }))
    }
    return allThreads
  }

  getThread = (threadID: string) => this.webClient.conversations.info({ channel: threadID })

  getThreads = async (cursor = undefined, threadTypes: ThreadType[] = [], limit = 100) => {
    const currentUser = await this.getCurrentUser()
    let response: ConversationsListResponse
    // This is done this way because Slack's API doesn't support all requests for guests
    // for those cases we'll use some deprecated endpoints (such as im, mpim and channels)
    // but this will allow us to retrieve all the data for guest users.
    // In case user is not a guest we'll use the latest method suggested by Slack team
    // conversation
    // We cannot use users.conversations neither (this could change in a future)
    // @see https://api.slack.com/docs/conversations-api
    // @see https://api.slack.com/methods/channels.list
    if (currentUser.user.guest_invited_by) {
      if (threadTypes.includes('dm')) {
        const [imList, mpimList] = await Promise.all([
          this.webClient.im.list(),
          this.webClient.mpim.list(),
        ])

        response.channels = [...response.channels, ...mpimList.groups as any, ...imList.ims as any]
        response.response_metadata = mpimList.response_metadata || imList.response_metadata || {}
      }

      if (threadTypes.includes('channel')) {
        const [channelsList, conversationsList] = await Promise.all([
          this.webClient.channels.list(),
          this.webClient.conversations.list(),
        ])

        response.channels = [...response.channels, ...(channelsList as any).channels, ...(conversationsList as any).channels]
        response.response_metadata = channelsList.response_metadata || conversationsList.response_metadata || response.response_metadata || {}
      }
    } else {
      const types = threadTypes.map(t => {
        if (t === 'dm') return ['mpim', 'im'].join(',')
        if (t === 'channel') return ['public_channel', 'private_channel'].join(',')
        return undefined
      }).join(',')

      response = await this.webClient.conversations.list({
        types,
        limit,
        cursor: cursor || undefined,
        exclude_archived: true,
      })
    }

    const channels = await this.loadAll(response.channels, threadTypes)
    return { ...response, channels: uniqBy(channels, 'id') }
  }

  markAsUnread = async (threadID: string, messageID?: string) => {
    const ts = messageID ?? String(await (await this.getThread(threadID)).channel[0]?.created)
    const res = await this.webClient.conversations.mark({ channel: threadID, ts })
  }

  messageReplies = (channel: string, ts: string) =>
    this.webClient.conversations.replies({ channel, ts })

  loadMentions = async (text: string): Promise<string> => {
    const timer = textsTime(`loadMentions text:${text}`)
    const matches = text?.match(MENTION_REGEX)
    if (!matches) return text

    let finalText = text

    for (const mentionedUser of matches || []) {
      const mentionedUserId = mentionedUser.replace('<@', '').replace('>', '')
      const foundUserProfile = (await this.getParticipantProfile(mentionedUserId))?.profile || { display_name: mentionedUser }
      finalText = finalText.replace(mentionedUser, foundUserProfile?.display_name || foundUserProfile?.real_name)
    }

    timer.timeEnd()
    return finalText
  }

  getMessages = async (threadID: string, limit = 100, latest: string = undefined) => {
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

      await Promise.all(richElements.map(async element => {
        if (element.type !== 'user') return
        element.profile = (await this.getParticipantProfile(element.user_id))?.profile
      }))

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

    await Promise.all(messages.map(loadMessage))

    response.messages = uniqBy(messages, 'ts')

    const participants = Object.values(participantsMap)

    return { response, participants }
  }

  getParticipantProfile = async (userId: string): Promise<User> => {
    const timer = textsTime(`getParticipantProfile Id:${userId}`)
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
    timer.timeEnd()
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

  _listUsers = async (cursor: string) => this.webClient.users.list({ limit: 100, cursor })

  listUsersWithCursor = memoize(this._listUsers)

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
      const moreMembers = await this.listUsersWithCursor(nextCursor)
      filteredMembers = moreMembers?.members?.filter(filterMembers) || []
      nextCursor = moreMembers?.response_metadata?.next_cursor || ''
    }

    return filteredMembers.map(mapProfile)
  }

  sendMessage = async (channel: string, thread_ts: string, content: MessageContent) => {
    const { text } = content

    let attachments: File[]
    if (content.fileBuffer || content.filePath) {
      const buffer = content.fileBuffer || await fs.readFile(content.filePath)
      const file = await this.webClient.files.upload({
        file: buffer,
        channels: channel,
        thread_ts,
        title: content.fileName,
        filename: content.fileName,
      }) || {} as FilesUploadResponse
      attachments = [file.file]
    }

    const res = await this.webClient.chat.postMessage({ channel, thread_ts, text, attachments: attachments as any[] })
    return res.message
  }

  editMessage = async (channel: string, ts: string, thread_ts: string, text: string): Promise<boolean> => {
    const res = await this.webClient.chat.update({ channel, ts, thread_ts, text })
    return res.ok
  }

  deleteMessage = async (channel: string, messageID: string) => {
    const res = await this.webClient.chat.delete({ channel, ts: messageID })
    return res.ok
  }

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
      timestamp: channel.created ? new Date(+channel.created * 1000) : new Date(Date.now()),
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

  unfurlLink = (link: string) =>
    this.webClient.apiCall('chat.unfurlLink', { url: link })

  addReaction = async (channel: string, timestamp: string, reactionKey: string) => {
    const name = emojiToShortcode(reactionKey) || reactionKey
    await this.webClient.reactions.add({ name, channel, timestamp })
  }

  removeReaction = async (channel: string, timestamp: string, reactionKey: string) => {
    const name = emojiToShortcode(reactionKey) || reactionKey
    await this.webClient.reactions.remove({ name, channel, timestamp })
  }

  getParticipants = async (threadID: string, limit = 50): Promise<string[]> => {
    if (!threadID) return []

    const res = await this.webClient.conversations.members({ channel: threadID, limit })
    return res.members || []
  }

  getUserPresence = async (userID: string) => {
    const res = await this.webClient.users.getPresence({ user: userID })
    return { userID, presence: res.presence }
  }

  setUserPresence = async (type: ActivityType.OFFLINE | ActivityType.ONLINE): Promise<void> => {
    /**
     * Using the webClient.users.setPresence method we cannot force the user to be active, but we can
     * use directly the apiCall and set the presence as active.
     *
     * @see https://api.slack.com/methods/users.setPresence
     */
    const presence = type === ActivityType.OFFLINE ? 'away' : 'auto'
    await this.webClient.apiCall('presence.set', {
      presence,
      token: this.webClient.token,
      _x_mode: 'online',
      _x_sonic: true,
    })
  }

  muteConversation = async (threadID: string, mutedUntil: 'forever' | null | Date): Promise<void> => {
    const value = mutedUntil === 'forever'
    /**
     * WebClient doesn't have a built-in method to setNotifications or mute a conversation (since their
     * clients changes) but they're still using the users.prefs.setNotifications method on their clients
     * and they'll keep using that.
     *
     * @see https://github.com/lamw/vmware-scripts/blob/master/powershell/slack_notifications.ps1#L65-L81
     */
    await this.webClient.apiCall('users.prefs.setNotifications', {
      token: this.webClient.token,
      name: 'muted',
      value,
      channel_id: threadID,
      global: false,
      sync: false,
    })
  }

  registerPush = async (pushToken: string, add: boolean): Promise<void> => {
    await this.webClient.apiCall(add ? 'push.add' : 'push.remove', {
      payload_version: '9',
      os_notifs_off: '0',
      is_work_profile: '0',
      app_id: 'slackandroid',
      push_token: pushToken,
      token: this.webClient.token,
    })
  }

  addParticipant = async (threadID: string, participantID: string): Promise<void> => {
    await this.webClient.conversations.invite({
      users: participantID,
      channel: threadID,
    })
  }

  removeParticipant = async (threadID: string, participantID: string): Promise<void> => {
    await this.webClient.conversations.kick({
      user: participantID,
      channel: threadID,
    })
  }
}
