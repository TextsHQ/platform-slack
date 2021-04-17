// eslint-disable-next-line import/no-extraneous-dependencies
import { InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapThreads, mapMessage } from './mappers'
import SlackAPI from './lib/slack'
import SlackRealTime from './lib/real-time'

export default class Slack implements PlatformAPI {
  private readonly api = new SlackAPI()

  private currentUser = null

  private eventTimeout?: NodeJS.Timeout

  private realTimeApi: null | SlackRealTime = null

  init = async (serialized: { cookies: any; clientToken: string }) => {
    const { cookies, clientToken } = serialized || {}
    if (!cookies && !clientToken) return

    const cookieJar = CookieJar.fromJSON(cookies) || null
    await this.api.setLoginState(cookieJar, clientToken)
    await this.afterAuth()
    // eslint-disable-next-line
    if (!this.currentUser?.ok) throw new ReAuthError() // todo improve
  }

  afterAuth = async () => {
    const currentUser = await this.api.getCurrentUser()
    this.currentUser = currentUser
    await this.api.setEmojis()
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

  dispose = () => {
    if (this.eventTimeout) clearInterval(this.eventTimeout)
  }

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = (onEvent: OnServerEventCallback): void => {
    this.realTimeApi = new SlackRealTime(this.api, onEvent)
    this.realTimeApi.subscribeToEvents()
  }

  searchUsers = async (typed: string) => this.api.searchUsers(typed)

  getThreads = async (inboxName: InboxName, pagination: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Thread>> => {
    const { cursor } = pagination || {}

    const { channels, response_metadata } = await this.api.getThreads(cursor)
    const currentUser = mapCurrentUser(this.currentUser)

    const items = mapThreads(channels as any[], currentUser.id)

    return {
      items,
      hasMore: items.length > 0,
      oldestCursor: response_metadata?.next_cursor,
    }
  }

  getMessages = async (threadID: string, pagination: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Message>> => {
    const { cursor } = pagination || {}

    const { messages } = await this.api.getMessages(threadID, 20, cursor)
    const currentUser = mapCurrentUser(this.currentUser)
    const items = (messages as any[])
      .map(message => mapMessage(message, currentUser.id, this.api.emojis))
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf())

    return {
      items,
      hasMore: items.length > 0,
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    const message = await this.api.sendMessage(threadID, content)
    const currentUser = mapCurrentUser(this.currentUser)
    return [mapMessage(message, currentUser.id, this.api.emojis)]
  }

  createThread = async (userIDs: string[]) => this.api.createThread(userIDs)

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    if (type === ActivityType.TYPING) await this.realTimeApi.rtm.sendTyping(threadID)
  }

  sendReadReceipt = async (threadID: string, messageID: string) => this.api.sendReadReceipt(threadID, messageID)

  deleteMessage = async (threadID: string, messageID: string) => {
    const res = await this.api.deleteMessage(threadID, messageID)
    return res.ok
  }

  getAsset = async (type: string, uri: string) => {
    if (type !== 'proxy') return
    const url = Buffer.from(uri, 'hex').toString()
    return this.api.fetchStream({ url })
  }
}
