import { PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent, CustomEmojiMap, ServerEventType, LoginCreds, texts, NotificationsInfo, MessageLink, ThreadFolderName, ClientContext } from '@textshq/platform-sdk'
import { ExpectedJSONGotHTMLError } from '@textshq/platform-sdk/dist/json'
import { CookieJar } from 'tough-cookie'
import { mapCurrentUser, mapMessage, mapParticipant, mapLinkAttachment } from './mappers'
import { MESSAGE_REPLY_THREAD_PREFIX } from './constants'
import { textsTime } from './util'

import SlackRealTime from './lib/real-time'
import SlackAPI from './lib/slack'

export type ThreadType = 'channel' | 'dm'

function mapThreadID(threadID: string) {
  if (threadID.startsWith(MESSAGE_REPLY_THREAD_PREFIX)) { // message replies
    const [, mainThreadID, messageID] = threadID.split('/')
    return { mainThreadID, messageID }
  }
  return { threadID }
}

function getIDs(_threadID: string) {
  const isMessageReplyThread = _threadID.startsWith(MESSAGE_REPLY_THREAD_PREFIX)
  const msgReplyThreadIDs = isMessageReplyThread ? mapThreadID(_threadID) : undefined
  return isMessageReplyThread ? {
    channel: msgReplyThreadIDs.mainThreadID,
    thread_ts: msgReplyThreadIDs.messageID,
  } : {
    channel: _threadID,
    thread_ts: undefined,
  }
}

export default class Slack implements PlatformAPI {
  constructor(readonly accountID: string) {}

  private readonly api = new SlackAPI()

  currentUserID: string

  private realTimeApi: null | SlackRealTime = null

  private threadTypes: ThreadType[]

  private showChannels = false

  init = async (serialized: { cookies: any, clientToken: string }, _: ClientContext, prefs: Record<string, any>) => {
    const timer = textsTime('init')
    this.showChannels = prefs?.show_channels

    const { cookies, clientToken } = serialized || {}
    if (!cookies && !clientToken) return

    const cookieJar = CookieJar.fromJSON(cookies) || null
    this.api.cookieJar = cookieJar
    await this.api.init({ clientToken, accountID: this.accountID })
    await this.afterAuth()
    // eslint-disable-next-line
    if (!this.api.currentUser?.auth.ok) throw new ReAuthError()
    timer.timeEnd()
  }

  afterAuth = async () => {
    const timer = textsTime('afterAuth')
    await this.api.getCurrentUser()
    this.currentUserID = this.api.currentUser.auth.user_id

    await this.api.setCustomEmojis()

    this.threadTypes = this.showChannels ? ['channel', 'dm'] : ['dm']
    timer.timeEnd()
  }

  login = async (creds: LoginCreds): Promise<LoginResult> => {
    const cookieJarJSON = 'cookieJarJSON' in creds && creds.cookieJarJSON
    const cookieJar = cookieJarJSON ? CookieJar.fromJSON(cookieJarJSON as any) : new CookieJar()
    this.api.cookieJar = cookieJar

    if (!('jsCodeResult' in creds && creds.jsCodeResult)) return { type: 'error', errorMessage: 'jsCodeResult was falsey' }
    const { appUrl, magicLink } = JSON.parse(creds.jsCodeResult)
    // this updates the cookie jar with the auth cookies
    if (appUrl) {
      /* {
          "teamName": "Texts",
          "teamUrl": "https://texts-co.slack.com/",
          "appUrl": "slack://T01QMMLU7JL/magic-login/4199616920993-83b9e3b9a37d8b38b1d291a2596ff25eb6c99c4b62c5c3716368c1fd49c19cc4?id=1"
        } */
      const { host: workspaceID, pathname } = new URL(appUrl)
      const [,, token] = pathname.split('/')
      const magicToken = `z-app-${workspaceID}-${token}`
      const res = await texts.fetch(`https://app.slack.com/api/auth.loginMagicBulk?magic_tokens=${magicToken}&ssb=1`, { cookieJar })
      const resBody = res.body.toString('utf-8')
      if (resBody[0] === '<') {
        texts.log(res.statusCode, resBody)
        throw new ExpectedJSONGotHTMLError(res.statusCode, resBody)
      }
      const resJSON = JSON.parse(resBody)
      const error = resJSON.token_results[magicToken]?.error
      if (error) {
        texts.error(resJSON)
        throw Error(error)
      }
    } else if (magicLink) {
      /*
        magicLink looks something like https://app.slack.com/t/textsdotcom/login/z-app-3840962440-2666413463120-bb7866a4b475fcf2328573f31307b77bd2b1445f34e96a87e51522514311e7e1?
        302 redirect to https://textsdotcom.slack.com/app-redir/login/z-app-3840962440-2666413463120-bb7866a4b475fcf2328573f31307b77bd2b1445f34e96a87e51522514311e7e1
        302 redirect to https://textsdotcom.slack.com/z-app-3840962440-2666413463120-bb7866a4b475fcf2328573f31307b77bd2b1445f34e96a87e51522514311e7e1
        302 redirect to https://slack.com/checkcookie?redir=https%3A%2F%2Ftextsdotcom.slack.com%2Fssb%2Fredirect (contains set-cookie headers)
      */
      texts.log('fetching magic link', magicLink)
      // todo: texts.fetch and texts.createHttpClient().requestAsString act differently here
      // await this.api.fetchHTML(magicLink)
      await texts.fetch(magicLink, { cookieJar })
    }

    await this.api.init({
      accountID: this.accountID,
      clientToken: undefined,
      workspaceURL: 'https://createremote.slack.com/',
    })

    await this.afterAuth()

    if (!this.api.userToken) throw Error('!userToken')
    return { type: 'success' }
  }

  serializeSession = () => ({
    cookies: this.api.cookieJar.toJSON(),
    clientToken: this.api.userToken,
  })

  dispose = () => this.realTimeApi?.dispose()

  getCurrentUser = () => mapCurrentUser(this.api.currentUser)

  subscribeToEvents = async (onEvent: OnServerEventCallback): Promise<void> => {
    this.api.onEvent = onEvent
    this.realTimeApi = new SlackRealTime(this.api, this, onEvent)

    await this.realTimeApi?.subscribeToEvents()
  }

  searchUsers = async (typed: string) => this.api.searchUsers(typed)

  onThreadSelected = async (threadID: string): Promise<void> => {
    // nothing needed for slack threads
    if (threadID?.startsWith(MESSAGE_REPLY_THREAD_PREFIX)) return

    const members = await this.api.getParticipants(threadID)
    const filteredIds = members.filter(id => id !== this.currentUserID)

    await this.realTimeApi?.subscribeToPresence(filteredIds)

    // All DMs starts with D, and in that case we don't need to fetch participants
    if (threadID?.startsWith('D')) return
    // The slice is to get the first 5 users that are members of the channel / group.
    // Those first 5 members should be the "more active" ones, will need to double check
    // reading Slack's API code.
    const users = await Promise.all(filteredIds.slice(0, 5).map(this.api.getParticipantProfile))
    const participants = users.map(mapParticipant)
    if (!participants.length) return

    this.api.onEvent([{
      type: ServerEventType.STATE_SYNC,
      mutationType: 'upsert',
      objectName: 'participant',
      objectIDs: { threadID },
      entries: participants,
    }])
  }

  getThreads = async (): Promise<Paginated<Thread>> => {
    const timer = textsTime('getThreads')
    const { threads: items, hasMore } = await this.api.getAllThreads(this.threadTypes)

    timer.timeEnd()

    return {
      items,
      hasMore,
    }
  }

  getMessages = async (threadID: string, pagination: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination || { cursor: null }
    const timer = textsTime('getMessages')

    if (threadID.startsWith(MESSAGE_REPLY_THREAD_PREFIX)) {
      const { mainThreadID, messageID } = mapThreadID(threadID)
      const { messages, response_metadata } = await this.api.messageReplies(mainThreadID, messageID)
      const items = messages.map(message => mapMessage(message, this.accountID, mainThreadID, this.currentUserID, this.api.customEmojis, true))
      return {
        items,
        hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
      }
    }

    const { messages, response_metadata } = await this.api.getMessages(threadID, 20, cursor)
    const items = messages.map(message => mapMessage(message, this.accountID, threadID, this.currentUserID, this.api.customEmojis)).reverse()

    timer.timeEnd()

    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    const { channel, thread_ts } = getIDs(threadID)
    const message = await this.api.sendMessage(channel, thread_ts, content)
    if (!message) return false

    return [mapMessage(message as any, this.accountID, channel, this.currentUserID, this.api.customEmojis)]
  }

  editMessage = async (threadID: string, messageID: string, msgContent: MessageContent) => {
    const { channel, thread_ts } = getIDs(threadID)
    return this.api.editMessage(channel, messageID, thread_ts, msgContent.text)
  }

  addReaction = (threadID: string, messageID: string, reactionKey: string) => {
    const { channel } = getIDs(threadID)
    return this.api.addReaction(channel, messageID, reactionKey)
  }

  removeReaction = (threadID: string, messageID: string, reactionKey: string) => {
    const { channel } = getIDs(threadID)
    return this.api.removeReaction(channel, messageID, reactionKey)
  }

  createThread = (userIDs: string[]) => this.api.createThread(userIDs)

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    switch (type) {
      case ActivityType.TYPING:
        await this.realTimeApi.rtm.sendTyping(threadID)
        break
      case ActivityType.ONLINE:
      case ActivityType.OFFLINE:
        // await this.api.setUserPresence(type)
        break
      default:
    }
  }

  getLinkPreview = async (link: string): Promise<MessageLink> => {
    const res = await this.api.unfurlLink(link)
    const att = res.attachments[link]
    if (att) return mapLinkAttachment(att)
  }

  sendReadReceipt = (threadID: string, messageID: string) =>
    this.api.sendReadReceipt(threadID, messageID)

  deleteMessage = async (threadID: string, messageID: string): Promise<void> => {
    await this.api.deleteMessage(threadID, messageID)
  }

  markAsUnread = this.api.markAsUnread

  getAsset = (_, type: string, uri: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(uri, 'hex').toString()
    return this.api.fetchStream(url)
  }

  getPresence = () => this.realTimeApi?.userPresence

  getCustomEmojis = () => {
    const map: CustomEmojiMap = {}
    for (const [shortcode, url] of Object.entries(this.api.customEmojis)) {
      if (url.startsWith('https://')) {
        map[shortcode] = url
      }
    }
    return map
  }

  updateThread = async (threadID: string, updates: Partial<Thread>) => {
    if ('mutedUntil' in updates) {
      await this.api.muteConversation(threadID, updates.mutedUntil)
    }
  }

  handleDeepLink = (link: string) => {
    // texts://platform-callback/{accountID}/show-message-replies/{threadID}/{slackMessage.ts}/{latestTimestamp}/{text}
    const [, , , , command, threadID, messageID, latestTimestamp, title] = link.split('/')
    if (command !== 'show-message-replies') throw Error(`invalid command: ${command}`)
    const thread: Thread = {
      id: `${MESSAGE_REPLY_THREAD_PREFIX}${threadID}/${messageID}`,
      type: 'channel',
      timestamp: +latestTimestamp ? new Date(+latestTimestamp * 1000) : new Date(),
      isUnread: false,
      isReadOnly: false,
      messages: { items: [], hasMore: true },
      participants: { items: [], hasMore: true },
      title: title ? `Slack Thread · ${title}...` : 'Slack Thread',
      extra: { selected: true },
    }
    this.api.onEvent([{
      type: ServerEventType.STATE_SYNC,
      mutationType: 'upsert',
      objectIDs: {},
      objectName: 'thread',
      entries: [thread],
    }])
  }

  registerForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, true)
  }

  unregisterForPushNotifications = async (type: keyof NotificationsInfo, token: string) => {
    if (type !== 'android') throw Error('invalid type')
    await this.api.registerPush(token, false)
  }

  addParticipant = this.api.addParticipant

  removeParticipant = this.api.removeParticipant
}
