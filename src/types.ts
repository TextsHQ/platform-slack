import type { User as SlackUser } from '@slack/web-api/dist/response/UsersInfoResponse'

interface WebAPICallResult {
  ok: boolean
  error?: string
  response_metadata?: {
    warnings?: string[]
    next_cursor?: string
    scopes?: string[]
    acceptedScopes?: string[]
    retryAfter?: number
    messages?: string[]
  }
  [key: string]: unknown
}

export declare type ConversationsListResponse = WebAPICallResult & {
  channels?: CustomListChannel[]
  error?: string
  needed?: string
  ok?: boolean
  provided?: string
  response_metadata?: ResponseMetadata
}
export interface CustomListChannel {
  conversation_host_id?: string
  created?: number
  creator?: string
  id?: string
  internal_team_ids?: string[]
  is_archived?: boolean
  is_channel?: boolean
  is_ext_shared?: boolean
  is_general?: boolean
  is_global_shared?: boolean
  is_group?: boolean
  is_im?: boolean
  is_member?: boolean
  is_moved?: number
  is_mpim?: boolean
  is_org_default?: boolean
  is_org_mandatory?: boolean
  is_org_shared?: boolean
  is_pending_ext_shared?: boolean
  is_private?: boolean
  is_shared?: boolean
  is_user_deleted?: boolean
  name?: string
  name_normalized?: string
  num_members?: number
  pending_connected_team_ids?: string[]
  pending_shared?: string[]
  previous_names?: string[]
  priority?: number
  purpose?: Purpose
  shared_team_ids?: string[]
  topic?: Purpose
  unlinked?: number
  user?: string
  channelInfo?: CustomInfoChannel
  timestamp?: number

}
export interface ResponseMetadata {
  next_cursor?: string
}

interface InfoLatest {
  thread_ts: string
  type: string
  user: string
  text: string
  ts: string
}
export declare type ConversationsInfoResponse = WebAPICallResult & {
  channel?: CustomInfoChannel
  error?: string
  needed?: string
  ok?: boolean
  provided?: string
}
export interface CustomInfoChannel {
  connected_limited_team_ids?: string[]
  connected_team_ids?: string[]
  conversation_host_id?: string
  created?: number
  creator?: string
  id?: string
  internal_team_ids?: string[]
  is_archived?: boolean
  is_channel?: boolean
  is_ext_shared?: boolean
  is_general?: boolean
  is_global_shared?: boolean
  is_group?: boolean
  is_im?: boolean
  is_member?: boolean
  is_moved?: number
  is_mpim?: boolean
  is_non_threadable?: boolean
  is_org_default?: boolean
  is_org_mandatory?: boolean
  is_org_shared?: boolean
  is_pending_ext_shared?: boolean
  is_private?: boolean
  is_read_only?: boolean
  is_shared?: boolean
  is_thread_only?: boolean
  last_read?: string
  locale?: string
  name?: string
  name_normalized?: string
  num_members?: number
  pending_connected_team_ids?: string[]
  pending_shared?: string[]
  previous_names?: string[]
  purpose?: Purpose
  shared_team_ids?: string[]
  topic?: Purpose
  unlinked?: number
  unread_count?: number
  latest?: InfoLatest
  participants?: SlackUser[]
}
interface Purpose {
  creator?: string
  last_set?: number
  value?: string
}
