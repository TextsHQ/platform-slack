// eslint-disable-next-line import/no-extraneous-dependencies
import { InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType, MessageContent } from '@textshq/platform-sdk'
import { CookieJar } from 'tough-cookie'

import { mapCurrentUser, mapThreads, mapMessage } from './mappers'
import SlackAPI from './lib/slack'

export default class Slack implements PlatformAPI {
  private readonly api = new SlackAPI()

  private currentUser = null

  private eventTimeout?: NodeJS.Timeout

  private onServerEvent: OnServerEventCallback

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
    this.onServerEvent = onEvent
  }

  searchUsers = async (typed: string) => this.api.searchUsers(typed)

  getThreads = async (inboxName: InboxName, { cursor, direction }: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Thread>> => {
    const { channels } = await this.api.getThreads()
    const currentUser = mapCurrentUser(this.currentUser)

    const items = mapThreads(channels as any[], currentUser.id)

    return {
      items,
      hasMore: false,
      oldestCursor: '0',
      newestCursor: '0',
    }
  }

  getMessages = async (threadID: string, { cursor, direction }: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Message>> => {
    const { messages } = await this.api.getMessages(threadID)
    const currentUser = mapCurrentUser(this.currentUser)
    const items = (messages as any[]).map(message => mapMessage(message, currentUser.id))

    return {
      items,
      hasMore: false,
      oldestCursor: '0',
      newestCursor: '0',
    }
  }

  sendMessage = async (threadID: string, content: MessageContent) => {
    const message = await this.api.sendMessage(threadID, content.text)
    const currentUser = mapCurrentUser(this.currentUser)
    return [mapMessage(message, currentUser.id)]
  }

  createThread = async (userIDs: string[]) => this.api.createThread(userIDs)

  sendActivityIndicator = async (type: ActivityType, threadID: string) => null

  sendReadReceipt = async (threadID: string, messageID: string) => null
}
