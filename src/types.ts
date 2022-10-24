import type { Channel as ListChannel } from '@slack/web-api/dist/response/ConversationsListResponse'
import type { Channel as InfoChannel } from '@slack/web-api/dist/response/ConversationsInfoResponse'
import type { User as SlackUser } from '@slack/web-api/dist/response/UsersInfoResponse'
import type { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse'

interface InfoLatest {
  thread_ts?: string
  type: string
  subtype?: string
  user: string
  text: string
  ts: string
}

export interface CustomListChannel extends ListChannel {
  channelInfo?: CustomInfoChannel
  messsages?: Message[]
}
export interface CustomInfoChannel extends InfoChannel {
  unread_count?: number
  latest?: InfoLatest
  participants?: SlackUser[]
}
