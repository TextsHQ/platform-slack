import path from 'path'
import fs from 'fs'
import { InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent, AccountInfo, CustomEmojiMap } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapThreads, mapMessage } from './mappers'
import SlackAPI from './lib/slack'
import SlackRealTime from './lib/real-time'

export type ThreadType = 'channel' | 'dm'

export default class Slack implements PlatformAPI {
  private readonly api = new SlackAPI()

  private currentUser = null

  private realTimeApi: null | SlackRealTime = null

  private threadTypes: ThreadType[]

  init = async (serialized: { cookies: any; clientToken: string }, { dataDirPath }: AccountInfo) => {
    const { cookies, clientToken } = serialized || {}
    if (!cookies && !clientToken) return

    const cookieJar = CookieJar.fromJSON(cookies) || null
    await this.api.setLoginState(cookieJar, clientToken)
    await this.afterAuth(dataDirPath)
    // eslint-disable-next-line
    if (!this.currentUser?.ok) throw new ReAuthError()
  }

  afterAuth = async (dataDirPath = '') => {
    const currentUser = await this.api.getCurrentUser()
    this.currentUser = currentUser
    await this.api.setEmojis()

    const onlyDMs = fs.existsSync(path.join(dataDirPath, '../slack-only-dms'))
    // TODO: Connect it with the platform-sdk user preference
    this.threadTypes = onlyDMs ? ['dm'] : ['channel', 'dm']
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
    const cookieJar = CookieJar.fromJSON(cookieJarJSON as any)
    await this.api.setLoginState(cookieJar)
    await this.afterAuth()

    if (this.currentUser.ok) return { type: 'success' }
    // FIXME: Add error message
    return { type: 'error', errorMessage: 'Error' }
  }

  serializeSession = () => ({
    cookies: this.api.cookieJar.toJSON(),
    clientToken: this.api.userToken,
  })

  dispose = () => this.realTimeApi.dispose()

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = (onEvent: OnServerEventCallback): void => {
    this.realTimeApi = new SlackRealTime(this.api, onEvent)
    this.realTimeApi.subscribeToEvents()
    this.api.setOnEvent(onEvent)
  }

  searchUsers = async (typed: string) => this.api.searchUsers(typed)

  getThreads = async (inboxName: InboxName, pagination: PaginationArg): Promise<Paginated<Thread>> => {
    const { cursor } = pagination || { cursor: null }

    const { channels, response_metadata } = await this.api.getThreads(cursor, this.threadTypes)
    const currentUser = mapCurrentUser(this.currentUser)

    const items = mapThreads(channels as any[], currentUser.id)

    const participants = items.filter(item => ['group', 'single'].includes(item.type)).flatMap(item => item.participants.items) || []
    const participantsIDs = participants.flatMap(item => item.id) || []
    await this.realTimeApi.subscribeToPresence(participantsIDs)

    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
      oldestCursor: response_metadata?.next_cursor,
    }
  }

  getMessages = async (threadID: string, pagination: PaginationArg): Promise<Paginated<Message>> => {
    const { cursor } = pagination || { cursor: null }

    const { messages, response_metadata } = await this.api.getMessages(threadID, 20, cursor)
    const currentUser = mapCurrentUser(this.currentUser)
    const items = (messages as any[])
      .map(message => mapMessage(message, currentUser.id, this.api.emojis))
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf())

    return {
      items,
      hasMore: items.length > 0 && Boolean(response_metadata?.next_cursor),
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    const message = await this.api.sendMessage(threadID, content)
    const currentUser = mapCurrentUser(this.currentUser)
    return [mapMessage(message, currentUser.id, this.api.emojis)]
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

  addReaction = this.api.addReaction

  removeReaction = this.api.removeReaction

  editMessage = this.api.editMessage

  getPresence = () => this.realTimeApi.userPresence

  getCustomEmojis = () => {
    const map: CustomEmojiMap = {}
    for (const [shortcode, url] of Object.entries(this.api.emojis)) {
      if (url.startsWith('https://')) {
        map[shortcode] = url
      }
    }
    return map
  }
}
