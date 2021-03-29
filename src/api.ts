import { CookieJar } from 'tough-cookie'
import mem from 'mem'
import { texts, InboxName, PaginationArg, Paginated, Thread, Message, PlatformAPI, OnServerEventCallback, LoginResult, ReAuthError, ActivityType } from '@textshq/platform-sdk'

import SlackAPI from './network-api'

import { mapThreads, mapCurrentUser, mapParticipant, SlackBootData } from './mappers'

const { IS_DEV } = texts

export default class Slack implements PlatformAPI {
  private readonly api = new SlackAPI()

  private disposed = false

  private currentUser = null

  private userUpdatesCursor = null

  private pollTimeout: NodeJS.Timeout

  private onServerEvent: OnServerEventCallback

  init = async (cookieJarJSON: string) => {
    if (!cookieJarJSON) return
    const cookieJar = CookieJar.fromJSON(cookieJarJSON)
    // TODO: remove this once double window problem is fixed
    const newJsCodeResult = SlackBootData
    await this.api.setLoginState(cookieJar, newJsCodeResult)
    await this.afterAuth()
    if (!this.currentUser?.id_str) throw new ReAuthError() // todo improve
  }

  afterAuth = async () => {
    const response = await this.api.account_verify_credentials()
    this.currentUser = response
  }

  login = async ({ cookieJarJSON }): Promise<LoginResult> => {
    // TODO: remove this once double window problem is fixed
    const newJsCodeResult = SlackBootData
    await this.api.setLoginState(CookieJar.fromJSON(cookieJarJSON as any), newJsCodeResult)
    await this.afterAuth()
    if (this.currentUser?.id_str) return { type: 'success' }
    const errorMessages = this.currentUser?.errors?.map(e => e.message)?.join('\n')
    return { type: 'error', errorMessage: errorMessages }
  }

  dispose = () => {
    // this.live.dispose()
    this.disposed = true
    clearTimeout(this.pollTimeout)
  }

  getCurrentUser = () => mapCurrentUser(this.currentUser)

  subscribeToEvents = (onEvent: OnServerEventCallback): void => {
    this.onServerEvent = onEvent
    // this.live.setup()
    // this.pollUserUpdates()
  }

  searchUsers = mem(async (typed: string) => {
    const { users } = await this.api.typeahead(typed) || {}
    return (users as any[] || []).map(u => mapParticipant(u, {}))
  })

  getThreads = async (inboxName: InboxName, { cursor, direction }: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Thread>> => {
    const inboxType = {
      [InboxName.NORMAL]: 'trusted',
      [InboxName.REQUESTS]: 'untrusted',
    }[inboxName]
    let json = null
    let timeline = null
    if (cursor) {
      json = await this.api.dm_inbox_timeline(inboxType, { [direction === 'before' ? 'max_id' : 'min_id']: cursor })
      json = json.inbox_timeline
      timeline = json
    } else {
      json = await this.api.dm_inbox_initial_state()
      json = json.inbox_initial_state
      timeline = json.inbox_timelines[inboxType]
      if (!this.userUpdatesCursor) this.userUpdatesCursor = json.cursor
    }
    return {
      items: [], //mapThreads(json, this.currentUser, inboxType),
      hasMore: timeline.status !== 'AT_END',
      oldestCursor: timeline.min_entry_id,
      newestCursor: timeline.max_entry_id,
    }
  }

  getMessages = async (threadID: string, { cursor, direction }: PaginationArg = { cursor: null, direction: null }): Promise<Paginated<Message>> => {
    const conversation_timeline = {
      status: "AT_START",
      min_entry_id: "abcd",
      max_entry_id: "xyz"
    }
    // const { conversation_timeline } = await this.api.dm_conversation_thread(threadID, cursor ? { [direction === 'before' ? 'max_id' : 'min_id']: cursor } : {})
    // const entries = Object.values(conversation_timeline.entries || {})
    // const thread = conversation_timeline.conversations[threadID]
    const items = [] // mapMessages(entries, thread, this.currentUser.id_str)
    return {
      items,
      hasMore: conversation_timeline.status !== 'AT_END',
      oldestCursor: conversation_timeline.min_entry_id,
      newestCursor: conversation_timeline.max_entry_id,
    }
  }

  createThread = async (userIDs: string[]) => {
    if (userIDs.length === 0) return null
    if (userIDs.length === 1) {
      const [userID] = userIDs
      const threadID = `${this.currentUser.id_str}-${userID}`
      // const { conversation_timeline } = await this.api.dm_conversation_thread(threadID, undefined)
      const conversation_timeline = {
        status: "AT_START",
        min_entry_id: "abcd",
        max_entry_id: "xyz"
      }
      if (!conversation_timeline) return
      if (IS_DEV) console.log(conversation_timeline)
      return  mapThreads(conversation_timeline, this.currentUser, 'trusted')[0]
    }
  }

  sendActivityIndicator = async (type: ActivityType, threadID: string) => {
    if (type === ActivityType.TYPING) await this.api.dm_conversation_typing(threadID)
  }

  sendReadReceipt = async (threadID: string, messageID: string) =>
    this.api.dm_conversation_mark_read(threadID, messageID)
}
