import { OnServerEventCallback, ServerEventType } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import type SlackAPI from './slack'

export default class SlackRealTime {
  public rtm: RTMClient

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

    await this.rtm.start()
  }
}
