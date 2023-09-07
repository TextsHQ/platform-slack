import { ActivityType, OnServerEventCallback, PresenceMap, ServerEventType, texts } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import { isEqual } from 'lodash'
import { mapEmojiChangedEvent, mapMessage, mapReactionKey, shortcodeToEmoji } from '../mappers'
import { MESSAGE_REPLY_THREAD_PREFIX } from '../constants'

import type SlackAPI from './slack'
import type PAPI from '../api'

function getThreadID(event: any) {
  if (event.thread_ts && event.message) return `${MESSAGE_REPLY_THREAD_PREFIX}${event.channel}/${event.message.ts}`
  return event.channel
}

export default class SlackRealTime {
  public rtm: RTMClient

  public userPresence: PresenceMap = {}

  private presenceSubscribedUsersIDs: string[] = []

  private ready = false

  constructor(
    private readonly api: SlackAPI,
    private readonly papi: InstanceType<typeof PAPI>,
    private onEvent: OnServerEventCallback,
  ) {}

  subscribeToEvents = async (): Promise<void> => {
    this.rtm = new RTMClient({
      webClient: this.api.webClient,
      autoReconnect: true,
      retryConfig: {
        retries: 99000,
        minTimeout: 0,
        maxTimeout: 1,
      },
    })

    this.rtm.on('ready', () => {
      texts.log('rtm ready')
      this.ready = true
    })

    this.rtm.on('disconnected', error => {
      texts.log(error)
      this.ready = false
    })

    // fixtures/message_rtm_event.json
    // fixtures/messase_changed_rtm_event.json
    /** https://api.slack.com/events/message */

    this.rtm.on('message', slackEvent => {
      const threadID = getThreadID(slackEvent)

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
        case 'message_replied':
          this.onEvent([
            { type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID },
            { type: ServerEventType.THREAD_MESSAGES_REFRESH, threadID: `${MESSAGE_REPLY_THREAD_PREFIX}${threadID}/${slackEvent.message?.ts}` },
          ])
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
        default: {
          /**
           * @notes
           *  this is a patch for when sending attachments / files. Slack is updating their
           *  attachments/uploads logic so when uploading a file to a channel or conversation
           *  it doesn't return a MessageType object but an array of files and then on real-time
           *  they send a slack without `SlackEvent.subtype`.
           *
           *  So what is happening here is that when the user sends a file, we set the returned
           *  id to the `api.attachmentsPromises` with a promise and return that promise, so this checks
           *  if a message is received with that `file.id` and there's a promise to resolve.
           */
          const [firstFile] = slackEvent?.files || []
          if (firstFile) {
            const possibleAttachmentFile = this.api.attachmentsPromises.get(firstFile.id)

            if (possibleAttachmentFile) {
              possibleAttachmentFile(slackEvent)
              this.api.attachmentsPromises.delete(firstFile.id)

              break
            }
          }

          this.onEvent([{
            type: ServerEventType.THREAD_MESSAGES_REFRESH,
            threadID,
          }])
        }
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
      const isOnline = presence === 'active'

      this.onEvent([{
        type: ServerEventType.USER_PRESENCE_UPDATED,
        presence: {
          userID: user,
          status: isOnline ? 'online' : 'offline',
          lastActive: isOnline ? new Date() : undefined,
        },
      }])
    })

    this.rtm.on('dnd_updated_user', async slackEvent => {
      const { user, dnd_status, event_ts } = slackEvent
      const { next_dnd_start_ts, next_dnd_end_ts } = dnd_status
      // The event timestamp it's between the do not disturb start and the do not disturb end
      const dndEnabled = next_dnd_start_ts < event_ts && next_dnd_end_ts > event_ts

      if (dndEnabled) {
        this.onEvent([{
          type: ServerEventType.USER_PRESENCE_UPDATED,
          presence: {
            userID: user,
            status: 'dnd',
          },
        }])
      } else {
        await this.requestUsersPresence([user])
      }
    })

    this.rtm.on('pref_change', async slackEvent => {
      /**
       * There's no way to get if only one channel pref has changed. But we get the 'all_notifications_pref'
       * event everytime we mute/unmute a channel from Slack's App or any other client.
       *
       * This event includes an object with the latests channels with changes, so we'll map those channels
       * and sync the 'muted' status
       *
       * @see https://api.slack.com/events/pref_change
       */
      if (slackEvent.name === 'all_notifications_prefs') {
        const value = JSON.parse(slackEvent.value || '{}')
        const channels = Object.entries(value?.channels || {}).map((channel: [string, Record<string, boolean | string>]) => ({
          id: channel[0],
          muted: channel?.[1]?.muted,
        }))

        const entries = channels.map(channel => ({
          id: channel.id,
          mutedUntil: channel.muted ? 'forever' : undefined,
        }))

        this.onEvent([{
          type: ServerEventType.STATE_SYNC,
          objectIDs: {},
          mutationType: 'update',
          objectName: 'thread',
          entries,
        }])
      }
    })

    // This is added because Slack has changed their policies and now you'll need to subscribe for each user
    // @see https://api.slack.com/changelog/2017-10-making-rtm-presence-subscription-only
    await this.rtm.start({ batch_presence_aware: true, presence_sub: true })
  }

  subscribeToPresence = async (users: string[]) => {
    if (!this.ready) return texts.log('slack rtm not connected')

    const filteredUsers = users.filter(id => !this.presenceSubscribedUsersIDs.includes(id))
    const newPresenceSubscriberUserIDs = [...this.presenceSubscribedUsersIDs, ...filteredUsers].sort()
    if (isEqual(newPresenceSubscriberUserIDs, this.presenceSubscribedUsersIDs)) {
      return texts.log('skipping presence_sub')
    }
    this.presenceSubscribedUsersIDs = newPresenceSubscriberUserIDs
    // We need to send the whole array with all the users because according to Slack's it'll only
    // subcribe to the latest array sent on this 'presence_sub' event
    await this.rtm.send('presence_sub', { ids: this.presenceSubscribedUsersIDs })
  }

  requestUsersPresence = async (users: string[]) => {
    if (!this.ready) return texts.log('slack rtm not connected')
    await this.rtm.send('presence_query', { ids: users })
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
