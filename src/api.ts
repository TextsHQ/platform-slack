import path from 'path'
import fs from 'fs'
import { InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent, AccountInfo, CustomEmojiMap, ServerEventType, LoginCreds, texts } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapThreads, mapMessage } from './mappers'
import SlackAPI from './lib/slack'
import SlackRealTime from './lib/real-time'
import { MESSAGE_REPLY_THREAD_PREFIX } from './constants'

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

  init = async (serialized: { cookies: any; clientToken: string }, { accountID, dataDirPath }: AccountInfo) => {
    this.accountID = accountID

    const { cookies, clientToken } = serialized || {}
    if (!cookies && !clientToken) return

    const cookieJar = CookieJar.fromJSON(cookies) || null
    await this.api.setLoginState(cookieJar, clientToken)
    await this.afterAuth(dataDirPath)
    // eslint-disable-next-line
    if (!this.currentUser?.auth.ok) throw new ReAuthError()
  }

  afterAuth = async (dataDirPath = '') => {
    const currentUser = await this.api.getCurrentUser()
    this.currentUser = currentUser
    this.currentUserID = currentUser.auth.user_id

    await this.api.setCustomEmojis()

    const onlyDMs = fs.existsSync(path.join(dataDirPath, '../slack-only-dms'))
    // TODO: Connect it with the platform-sdk user preference
    this.threadTypes = onlyDMs ? ['dm'] : ['channel', 'dm']
  }

  login = async ({ cookieJarJSON, jsCodeResult }: LoginCreds): Promise<LoginResult> => {
    const cookieJar = CookieJar.fromJSON(cookieJarJSON as any)
    // This is done because it may come as jsCodeResult a magic link to do the login. It'd be
    // better to do the request here in the "texts-side" because otherwise in the login browser
    // it'll redirect the user to Slack's app (directly to the deep-link), so this way we update
    // the cookieJar directly from Texts.
    if (jsCodeResult) await texts.fetch(jsCodeResult, { cookieJar })

    await this.api.setLoginState(cookieJar)
    await this.afterAuth()

    if (this.api.userToken) return { type: 'success' }
    // FIXME: Add error message
    return { type: 'error', errorMessage: 'Error' }
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

  getThreads = async (inboxName: InboxName, pagination: PaginationArg): Promise<Paginated<Thread>> => {
    const { cursor } = pagination || { cursor: null }

    const { channels, response_metadata } = await this.api.getThreads(cursor, this.threadTypes)

    const items = mapThreads(channels as any[], this.accountID, this.currentUserID, this.api.customEmojis)

    const participants = items.filter(item => ['group', 'single'].includes(item.type)).flatMap(item => item.participants.items) || []
    const participantsIDs = participants.flatMap(item => item.id) || []
    await this.realTimeApi?.subscribeToPresence(participantsIDs)

    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
      oldestCursor: response_metadata?.next_cursor,
    }
  }

  getMessages = async (threadID: string, pagination: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination || { cursor: null }

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

    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    const { channel, thread_ts } = getIDs(threadID)
    const message = await this.api.sendMessage(channel, thread_ts, content)
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
    return res.ok
  }

  getAsset = (type: string, uri: string) => {
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
      objectIDs: { threadID: thread.id },
      objectName: 'thread',
      entries: [thread],
    }])
  }
}
