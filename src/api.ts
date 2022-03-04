import { InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent, AccountInfo, CustomEmojiMap, ServerEventType, LoginCreds, texts, GetAssetOptions } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapThreads, mapMessage } from './mappers'
import SlackAPI from './lib/slack'
import SlackRealTime from './lib/real-time'
import { MESSAGE_REPLY_THREAD_PREFIX } from './constants'
import { textsTime } from './util'

if (texts.IS_DEV) {
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  require('source-map-support').install()
}

export type ThreadType = 'channel' | 'dm'

function mapThreadID(threadID: string) {
  if (threadID?.startsWith(MESSAGE_REPLY_THREAD_PREFIX)) { // message replies
    const [, mainThreadID, messageID] = threadID.split('/')
    return { mainThreadID, messageID }
  }
  return { threadID }
}

function getIDs(_threadID: string) {
  const isMessageReplyThread = _threadID.startsWith(MESSAGE_REPLY_THREAD_PREFIX)
  const msgReplyThreadIDs = isMessageReplyThread ? mapThreadID(_threadID) : undefined
  return {
    channel: isMessageReplyThread ? msgReplyThreadIDs.mainThreadID : _threadID,
    thread_ts: isMessageReplyThread ? msgReplyThreadIDs.messageID : undefined,
  }
}

export default class Slack implements PlatformAPI {
  private readonly api = new SlackAPI()

  accountID: string

  currentUserID: string

  private currentUser: any = null

  private realTimeApi: null | SlackRealTime = null

  private threadTypes: ThreadType[]

  private showChannels = false

  init = async (serialized: { cookies: any, clientToken: string }, { accountID, dataDirPath }: AccountInfo, prefs: Record<string, any>) => {
    const timer = textsTime('init')
    this.accountID = accountID
    this.showChannels = prefs?.show_channels

    const { cookies, clientToken } = serialized || {}
    if (!cookies && !clientToken) return

    const cookieJar = CookieJar.fromJSON(cookies) || null
    this.api.cookieJar = cookieJar
    await this.api.init(clientToken)
    await this.afterAuth(dataDirPath)
    // eslint-disable-next-line
    if (!this.currentUser?.auth.ok) throw new ReAuthError()
    timer.timeEnd()
  }

  afterAuth = async (dataDirPath = '') => {
    const timer = textsTime('afterAuth')
    const currentUser = await this.api.getCurrentUser()
    this.currentUser = currentUser
    this.currentUserID = currentUser.auth.user_id

    await this.api.setCustomEmojis()

    this.threadTypes = this.showChannels ? ['channel', 'dm'] : ['dm']
    timer.timeEnd()
  }

  login = async ({ cookieJarJSON, jsCodeResult }: LoginCreds): Promise<LoginResult> => {
    const cookieJar = CookieJar.fromJSON(cookieJarJSON as any)
    if (!jsCodeResult) return { type: 'error', errorMessage: 'jsCodeResult was falsey' }
    const { magicLink } = JSON.parse(jsCodeResult)

    this.api.cookieJar = cookieJar
    // this updates the cookie jar with the auth cookies
    if (magicLink) {
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

    await this.api.init(undefined)
    await this.afterAuth()

    if (this.api.userToken) return { type: 'success' }
    // FIXME: Add error message
    return { type: 'error', errorMessage: 'Unknown error' }
  }

  serializeSession = () => ({
    cookies: this.api.cookieJar.toJSON(),
    clientToken: this.api.userToken,
  })

  dispose = () => this.realTimeApi?.dispose()

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = async (onEvent: OnServerEventCallback): Promise<void> => {
    this.api.onEvent = onEvent
    this.realTimeApi = new SlackRealTime(this.api, this, onEvent)
    await this.realTimeApi?.subscribeToEvents()
  }

  searchUsers = async (typed: string) => this.api.searchUsers(typed)

  onThreadSelected = async (threadID: string) => {
    // nothing needed for slack threads
    if (threadID.startsWith(MESSAGE_REPLY_THREAD_PREFIX)) return
    const timer = textsTime('onThreadSelected')
    const members = await this.api.getParticipants(threadID)
    const filteredIds = members.filter(id => id !== this.currentUserID)
    timer.timeEnd()
    await this.realTimeApi?.subscribeToPresence(filteredIds)
  }

  getThreads = async (inboxName: InboxName, pagination: PaginationArg): Promise<Paginated<Thread>> => {
    const timer = textsTime('getThreads')
    const { cursor } = pagination || { cursor: null }

    const { channels, response_metadata } = await this.api.getThreads(cursor, this.threadTypes)
    const { team } = this.currentUser

    const items = mapThreads(channels as any[], this.accountID, this.currentUserID, this.api.customEmojis, team.name)

    timer.timeEnd()
    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
      oldestCursor: response_metadata?.next_cursor,
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
    if (type === ActivityType.TYPING) await this.realTimeApi.rtm.sendTyping(threadID)
  }

  sendReadReceipt = (threadID: string, messageID: string) => this.api.sendReadReceipt(threadID, messageID)

  deleteMessage = async (threadID: string, messageID: string) => {
    const res = await this.api.deleteMessage(threadID, messageID)
    return res
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

  handleDeepLink = (link: string) => {
    // texts://platform-callback/{accountID}/show-message-replies/{threadID}/{slackMessage.ts}
    const [, , , , command, threadID, messageID, latestTimestamp, title] = link.split('/')
    if (command !== 'show-message-replies') throw Error(`invalid command: ${command}`)
    const thread: Thread = {
      id: `${MESSAGE_REPLY_THREAD_PREFIX}${threadID}/${messageID}`,
      type: 'channel',
      timestamp: new Date(+latestTimestamp * 1000),
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
}
