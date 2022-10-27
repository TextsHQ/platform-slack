import type { Channel as InfoChannel } from '@slack/web-api/dist/response/ConversationsListResponse'
import type { User as SlackUser } from '@slack/web-api/dist/response/UsersInfoResponse'
import type { Message } from '@slack/web-api/dist/response/ConversationsHistoryResponse'

export interface CustomChannel extends InfoChannel {
  participants?: SlackUser[]
  messages?: Message[]
  counts?: Count
}

export interface Count { id: string, last_read: string, latest: string, updated: string, history_invalid: string, mention_count: number, has_unreads: boolean }
export interface UserCounts { ok: boolean, channels: Count[], mpims: Count[], ims: Count[] }
