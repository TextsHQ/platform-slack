import { ActivityType, OnServerEventCallback, PresenceMap, ServerEventType } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import { mapEmojiChangedEvent, mapReactionKey, shortcodeToEmoji } from '../mappers'
import type SlackAPI from './slack'

export default class SlackRealTime {
  public rtm: RTMClient

  public userPresence: PresenceMap = {}

  constructor(
    private api: SlackAPI,
    private onEvent: OnServerEventCallback,
  ) {}

  subscribeToEvents = async (): Promise<void> => {
    this.rtm = new RTMClient(this.api.userToken)

    // fixtures/message_rtm_event.json
    // fixtures/messase_changed_rtm_event.json
    this.rtm.on('message', slackEvent => {
      this.onEvent([{
        type: ServerEventType.THREAD_MESSAGES_REFRESH,
        threadID: slackEvent?.channel,
      }])
    })

    this.rtm.on('user_typing', slackEvent => {
      this.onEvent([{
        type: ServerEventType.USER_ACTIVITY,
        activityType: ActivityType.TYPING,
        threadID: slackEvent?.channel,
        participantID: slackEvent?.user,
        durationMs: 5000, // todo review
      }])
    })

    /** https://api.slack.com/events/emoji_changed */
    this.rtm.on('emoji_changed', slackEvent => {
      this.onEvent(mapEmojiChangedEvent(slackEvent))
    })

    this.rtm.on('reaction_added', slackEvent => {
      const participantID = slackEvent.item_user
      const emoji = shortcodeToEmoji(slackEvent.reaction)
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {
          threadID: slackEvent.item.channel,
          messageID: slackEvent.item.ts,
        },
        mutationType: 'upsert',
        objectName: 'message_reaction',
        entries: [{
          id: `${participantID}${emoji || slackEvent.reaction}`,
          participantID,
          reactionKey: emoji || mapReactionKey(slackEvent.reaction, this.api.customEmojis),
          emoji: !!emoji,
        }],
      }])
    })

    this.rtm.on('reaction_removed', slackEvent => {
      const emoji = shortcodeToEmoji(slackEvent.reaction)
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {
          threadID: slackEvent.item.channel,
          messageID: slackEvent.item.ts,
        },
        mutationType: 'delete',
        objectName: 'message_reaction',
        entries: [`${slackEvent.item_user}${emoji || slackEvent.reaction}`],
      }])
    })

    this.rtm.on('channel_marked', slackEvent => {
      const { num_mentions_display, unread_count_display } = slackEvent

      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {},
        mutationType: 'update',
        objectName: 'thread',
        entries: [{ id: slackEvent.channel, isUnread: Boolean(unread_count_display > 0 || num_mentions_display > 0) }],
      }])
    })

    this.rtm.on('im_marked', slackEvent => {
      const { num_mentions_display, unread_count_display } = slackEvent

      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {},
        mutationType: 'update',
        objectName: 'thread',
        entries: [{ id: slackEvent.channel, isUnread: Boolean(unread_count_display > 0 || num_mentions_display > 0) }],
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

  async dispose() {
    // @see https://github.com/slackapi/node-slack-sdk/issues/842#issuecomment-606009261
    try {
      await this.rtm.disconnect()
      await this.rtm.disconnect()
    } catch (message) {
      return console.error(message)
    }
  }
}
