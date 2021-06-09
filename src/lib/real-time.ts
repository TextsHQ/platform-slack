import { OnServerEventCallback, PresenceMap, ServerEventType } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import type SlackAPI from './slack'

export default class SlackRealTime {
  public rtm: RTMClient

  public userPresence: PresenceMap = {}

  constructor(
    private api: SlackAPI,
    private onEvent: OnServerEventCallback,
  ) {}

  subscribeToEvents = async (): Promise<void> => {
    const token = this.api.userToken
    this.rtm = new RTMClient(token)

    this.rtm.on('message', slackEvent => {
      this.onEvent([{
        type: ServerEventType.THREAD_MESSAGES_REFRESH,
        threadID: slackEvent?.channel,
      }])
    })

    this.rtm.on('user_typing', slackEvent => {
      this.onEvent([{
        type: ServerEventType.PARTICIPANT_TYPING,
        threadID: slackEvent?.channel,
        participantID: slackEvent?.user,
        typing: true,
      }])
    })

    this.rtm.on('reaction_added', slackEvent => {
      this.onEvent([{
        type: ServerEventType.THREAD_MESSAGES_REFRESH,
        threadID: slackEvent?.item?.channel,
      }])
    })

    this.rtm.on('reaction_removed', slackEvent => {
      this.onEvent([{
        type: ServerEventType.THREAD_MESSAGES_REFRESH,
        threadID: slackEvent?.item?.channel,
      }])
    })

    this.rtm.on('channel_marked', slackEvent => {
      const { num_mentions_display, unread_count_display } = slackEvent

      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {
          threadID: slackEvent.channel,
        },
        mutationType: 'update',
        objectName: 'thread',
        entries: [{ isUnread: Boolean(unread_count_display > 0 || num_mentions_display > 0) }],
      }])
    })

    this.rtm.on('im_marked', slackEvent => {
      const { num_mentions_display, unread_count_display } = slackEvent

      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {
          threadID: slackEvent.channel,
        },
        mutationType: 'update',
        objectName: 'thread',
        entries: [{ isUnread: Boolean(unread_count_display > 0 || num_mentions_display > 0) }],
      }])
    })

    this.rtm.on('presence_change', slackEvent => {
      const { user, presence } = slackEvent

      this.onEvent([{
        type: ServerEventType.USER_PRESENCE_UPDATED,
        presence: {
          userID: user,
          isActive: presence === 'active',
          lastActive: undefined,
        },
      }])
    })

    // This is added because Slack has changed their policies and now you'll need to subscribe for each user
    // @see https://api.slack.com/changelog/2017-10-making-rtm-presence-subscription-only
    // @ts-expect-error
    await this.rtm.start({ batch_presence_aware: 1 })
  }

  subscribeToPresence = async (users: string[]): Promise<void> => {
    const alreadySubscribed = Object.keys(this.userPresence)
    await this.rtm.subscribePresence(users.filter(id => !alreadySubscribed.includes(id)))
  }

  dispose() {
    return this.rtm.disconnect()
  }
}
