import { ActivityType, OnServerEventCallback, PresenceMap, ServerEventType, texts } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import { mapEmojiChangedEvent, mapMessage, mapReactionKey, shortcodeToEmoji } from '../mappers'
import { MESSAGE_REPLY_THREAD_PREFIX } from '../constants'
import type SlackAPI from './slack'
import type PAPI from '../api'

function getThreadID(event: any) {
  if (event.thread_ts) return `${MESSAGE_REPLY_THREAD_PREFIX}${event.channel}/${event.ts}`
  return event.channel
}

export default class SlackRealTime {
  public rtm: RTMClient

  public userPresence: PresenceMap = {}

  constructor(
    private readonly api: SlackAPI,
    private readonly papi: InstanceType<typeof PAPI>,
    private onEvent: OnServerEventCallback,
  ) {}

  subscribeToEvents = async (): Promise<void> => {
    this.rtm = new RTMClient({ webClient: this.api.webClient })

    // fixtures/message_rtm_event.json
    // fixtures/messase_changed_rtm_event.json
    /** https://api.slack.com/events/message */
    this.rtm.on('message', slackEvent => {
      const threadID = getThreadID(slackEvent)
      // console.log(JSON.stringify(slackEvent, null, 2))
      switch (slackEvent.subtype) {
        case 'message_changed':
          this.onEvent([{
            type: ServerEventType.STATE_SYNC,
            objectIDs: { threadID },
            objectName: 'message',
            mutationType: 'update',
            entries: [mapMessage(slackEvent.message, this.papi.accountID, threadID, this.papi.currentUserID, this.api.customEmojis)],
          }])
          break
        case 'message_deleted':
          this.onEvent([{
            type: ServerEventType.STATE_SYNC,
            objectIDs: { threadID },
            objectName: 'message',
            mutationType: 'delete',
            entries: [slackEvent.deleted_ts], // this is correct, deleted_ts is the message timestamp
          }])
          break
        default:
          this.onEvent([{
            type: ServerEventType.THREAD_MESSAGES_REFRESH,
            threadID,
          }])
      }
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
      const participantID = slackEvent.user
      const emoji = shortcodeToEmoji(slackEvent.reaction)
      const reactionKey = emoji || slackEvent.reaction
      this.onEvent([{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {
          threadID: slackEvent.item.channel,
          messageID: slackEvent.item.ts,
        },
        mutationType: 'upsert',
        objectName: 'message_reaction',
        entries: [{
          id: `${participantID}${reactionKey}`,
          participantID,
          reactionKey,
          imgURL: emoji ? undefined : mapReactionKey(slackEvent.reaction, this.api.customEmojis),
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
        entries: [`${slackEvent.user}${emoji || slackEvent.reaction}`],
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
    if (!this.rtm?.connected) return texts.log('slack rtm not connected')
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
