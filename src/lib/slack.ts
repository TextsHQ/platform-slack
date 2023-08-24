import { MessageContent, Thread, texts, FetchOptions, OnServerEventCallback, ServerEventType, Participant, ActivityType } from '@textshq/platform-sdk'
import { WebClient } from '@slack/web-api'
import { promises as fs } from 'fs'
import { uniqBy, memoize } from 'lodash'
import { setTimeout as setTimeoutAsync } from 'timers/promises'

import type { Member } from '@slack/web-api/dist/response/UsersListResponse'
import type { CookieJar } from 'tough-cookie'

import { extractRichElements, mapParticipant, mapProfile } from '../mappers'
import { emojiToShortcode } from '../text-attributes'
import { MENTION_REGEX } from '../constants'
import { textsTime } from '../util'
import type { ThreadType } from '../api'

export default class SlackAPI {
  cookieJar: CookieJar

  onEvent: OnServerEventCallback

  userToken: string

  webClient: WebClient

  customEmojis: Record<string, string>

  currentUser?: { auth: any, user: any, team: any }

  public attachmentsPromises: Map<string, Function> = new Map()

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

  static get htmlHeaders() {
    return {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'sec-ch-ua': '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'User-Agent': texts.constants.USER_AGENT,
    }
  }

  private fetchHTML = async (url: string) => {
    const { statusCode, body: html } = await this.httpClient.requestAsString(url, { cookieJar: this.cookieJar, headers: SlackAPI.htmlHeaders })
    if (statusCode >= 400) {
      throw Error(`${url} returned status code ${statusCode}`)
    }
    if (!html) throw Error('empty body')
    if (html.includes('"is_unsupported_webclient_browser":true')) {
      const msg = 'slack unsupported browser issue: ' + url
      texts.Sentry.captureMessage(msg)
      console.log(msg)
    }
    return html
  }

  private getFirstTeamURLOld = async () => {
    console.log('using getFirstTeamURLOld')
    texts.Sentry.captureMessage('using getFirstTeamURLOld')
    const html = await this.fetchHTML('https://app.slack.com/')
    // TD.boot_data.team_url = "https:\/\/texts-co.slack.com\/";
    const [, domain] = html.match(/TD\.boot_data\.team_url = (.+?);/) || []
    if (domain) return JSON.parse(domain) // 'https://texts-co.slack.com/'
    throw Error('Could not find team URL')
  }

  private getFirstTeamURL = async () => {
    const res = await texts.fetch('https://my.slack.com/', { cookieJar: this.cookieJar, headers: SlackAPI.htmlHeaders, method: 'HEAD', followRedirect: false })
    const { location } = res.headers
    if (location) return location
    return this.getFirstTeamURLOld()
  }

  private getClientTokenOld = async () => {
    console.log('using getClientTokenOld')
    texts.Sentry.captureMessage('using getClientTokenOld')
    const teamURL = await this.getFirstTeamURL()
    for (const pathname of ['customize/emoji', 'home']) {
      const html = await this.fetchHTML(teamURL + pathname)
      // "api_token":"xoxc-2837734959632-2807131363654-1044634777490-836bed83bf8aa7ebcaf06a70df3df6ec7153d219003a75f2dce10db1fc1db50f"
      const [, token] = html.match(/"api_token":"(.+?)"/) || []
      if (token) return token
    }
    throw new Error('Unable to find API token')
  }

  private getConfig = async () => {
    const html = await this.fetchHTML('https://app.slack.com/auth?app=client')
    const [, json] = html.match(/JSON.stringify\((.+?)\)/) || []
    const config = JSON.parse(json)
    return config
  }

  private getClientToken = async () => {
    const [teamURL, config] = await Promise.all([
      this.getFirstTeamURL(),
      this.getConfig(),
    ])
    for (const team of Object.values<any>(config.teams)) {
      if (team.url === teamURL) return team.token || team.enterprise_api_token
    }
    texts.error('didnt find token', JSON.stringify(config), teamURL)
    return this.getClientTokenOld()
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

  loadPublicChannel = async (channel: any) => {
    const timer = textsTime(`loadPublicChannel Id:${channel.id}`)
    const { id } = channel
    const threadInfo = await this.webClient.conversations.info({ channel: id })

    const { channel: channelInfo } = threadInfo as any || {}
    if (channelInfo?.latest?.text) channelInfo.latest.text = await this.loadMentions(channelInfo?.latest?.text)
    // As we don't have the latest activity, we can use different fields to get the thread timestamp
    const date = (Number(channelInfo?.last_read) || channelInfo?.created || 0) * 1000
    channel.timestamp = date ? new Date(date) : undefined
    channel.unread = channelInfo?.unread_count || undefined
    channel.messages = [channelInfo?.latest].filter(x => x?.ts) || []
    channel.participants = []
    timer.timeEnd()
  }

  loadPrivateMessage = async (thread: any) => {
    const timer = textsTime(`loadPrivateMessage Id:${thread.id}`)
    const { id, user: userId } = thread

    const [user, threadInfo] = await Promise.all([
      this.getParticipantProfile(userId),
      this.webClient.conversations.info({ channel: id }),
    ])

    const { channel } = threadInfo as any || {}
    if (channel?.latest?.text) channel.latest.text = await this.loadMentions(channel?.latest?.text)

    const date = (Number(channel?.last_read) || channel?.created || 0) * 1000
    // We're gonna hide and show private messages following some logic that is inspired in Slack's
    // behavior. If there's an interaction between users (`latests.ts`) or the thread is open (`.is_open`)
    // or there's a date of the last interaction (`.last_read`) it should show the thread.
    const shouldShow = !!channel?.latest?.ts || !!channel?.is_open || !!Number(channel?.last_read)
    thread.timestamp = shouldShow ? new Date(date) : undefined
    thread.unread = channel?.unread_count || undefined
    // This filter is because sometimes the latest message hasn't timestamp and can be a response from a thread
    // so this way we filter only messages that aren't thread responses
    thread.messages = [channel?.latest].filter(x => x?.ts && !x?.thread_ts) || []

    thread.participants = thread?.is_im
      ? [user]
      : channel?.members?.length < 10
        ? await Promise.all(channel.members.map(this.getParticipantProfile))
        : []

    // For some reason groups come with the name 'mpdm-firstuser--seconduser--thirduser-1'
    thread.name = thread?.is_mpim ? thread?.name.replace('mpdm-', '').replace('-1', '').split('--').join(', ') : ''
    timer.timeEnd()
  }

  getThreadsNonPaginated = async (threadTypes: ThreadType[] = []) => {
    const allThreads = []
    // https://api.slack.com/docs/pagination#cursors
    let cursor: string
    let times = 0

    do {
      try {
        const { channels, response_metadata } = await this.getThreads(cursor, threadTypes)
        allThreads.push(...channels)
        cursor = response_metadata?.next_cursor
      } catch (error) {
        texts.error(error)

        if (times < 20) times += 1
        else cursor = null
      }
    } while (cursor)
    return allThreads
  }

  getThreads = async (cursor = undefined, threadTypes: ThreadType[] = []) => {
    let response: any = { channels: [] }

    const types = threadTypes.map(t => {
      if (t === 'dm') return ['mpim', 'im'].join(',')
      if (t === 'channel') return ['public_channel', 'private_channel'].join(',')
      return undefined
    }).join(',')

    response = await this.webClient.conversations.list({
      types,
      limit: 100,
      cursor: cursor || undefined,
      exclude_archived: true,
    })

    const privateMessages = threadTypes.includes('dm')
      ? (response.channels as { is_im: boolean, is_mpim?: boolean }[]).filter(({ is_im, is_mpim }) => is_im || is_mpim)
      : []

    const publicChannels = threadTypes.includes('channel')
      ? (response.channels as { is_channel: boolean, is_member: boolean }[]).filter(({ is_channel, is_member }) => is_channel && is_member)
      : []

    await Promise.all([
      ...publicChannels.map(this.loadPublicChannel),
      ...privateMessages.map(this.loadPrivateMessage),
    ])
    response.channels = uniqBy([...privateMessages, ...publicChannels], 'id')

    return response
  }

  markAsUnread = async (threadID: string, messageID: string) => {
    let messageTs = messageID

    if (!messageID) {
      const messages = await this.getMessages(threadID, 2)
      const [latest] = messages?.messages?.reverse() || []
      messageTs = latest.ts || ''
    }

    await this.webClient.conversations.mark({ channel: threadID, ts: messageTs })
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
      const isBot = message?.bot_id && message?.bot_id !== 'B01' && !message?.user
      const user = sharedParticipant || (isBot ? await this.getParticipantBot(message.bot_id).catch(() => ({})) : await this.getParticipantProfile(messageUser))
      // @notes
      // Enterprise workspaces already return `message.user` with user's id so we will use that value
      // in case it is already present in the `message` object.
      message.user = message.user || user.profile.user_id || user.profile.id
      if (!message.user) return

      const p = mapParticipant(user)
      if (!participantsMap[p.id]) participantsMap[p.id] = p
    }

    await Promise.all(messages.map(loadMessage))

    response.messages = uniqBy(messages, 'ts')

    const participants = Object.values(participantsMap)

    if (participants.length > 0) {
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        mutationType: 'upsert',
        objectName: 'participant',
        objectIDs: { threadID },
        entries: participants.filter(participant => participant.id),
      }])
    }

    return response
  }

  getParticipantProfile = async (userId: string) => {
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

  sendMessage = async (
    channel: string,
    thread_ts: string,
    content: MessageContent,
  ) => {
    const { text } = content

    if (content.fileBuffer || content.filePath) {
      const buffer = content.fileBuffer || await fs.readFile(content.filePath)
      const file = await this.webClient.files.uploadV2({
        file: buffer,
        channel_id: channel,
        thread_ts,
        title: content.fileName,
        filename: content.fileName,
      })

      const [firstFile] = (file as any).files || []

      const promise = new Promise(resolve => {
        this.attachmentsPromises.set(firstFile?.file?.id, resolve)
      })

      return Promise.race([
        promise,
        setTimeoutAsync(15_000).then(() => true),
      ])
    }

    try {
      const res = await this.webClient.chat.postMessage({
        channel,
        thread_ts,
        text,
        link_names: content.mentionedUserIDs?.length > 0,
      })

      return res.message
    } catch (error) {
      // todo: hack, improve
      if (error.message.includes('restricted_action_read_only_channel')) {
        this.onEvent([{
          type: ServerEventType.STATE_SYNC,
          objectIDs: {},
          objectName: 'thread',
          mutationType: 'update',
          entries: [{ id: channel, isReadOnly: true }],
        }])
        return false
      }
      throw error
    }
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

    const promises = userIDs.map(user => this.webClient.users.profile.get({ user }).catch(texts.error))
    const profiles = (await Promise.all(promises)).filter(Boolean).map(mapParticipant)

    return {
      id: channel.id,
      title: profiles.map(user => user.username).join(', '),
      type: userIDs.length > 1 ? 'group' : 'single',
      participants: { items: profiles, hasMore: false },
      messages: { items: [], hasMore: false },
      timestamp: new Date(channel?.created),
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
