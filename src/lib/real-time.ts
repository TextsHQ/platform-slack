// eslint-disable-next-line import/no-extraneous-dependencies
import { OnServerEventCallback, ServerEventType } from '@textshq/platform-sdk'
import { RTMClient } from '@slack/rtm-api'

import type SlackAPI from './slack'

export default class SlackRealTime {
  constructor(
    private api: SlackAPI,
    private onEvent: OnServerEventCallback,
  ) {}

  subscribeToEvents = async (): Promise<void> => {
    const token = this.api.userToken
    const rtm = new RTMClient(token)

    rtm.on('message', slackEvent => {
      this.onEvent([{
        type: ServerEventType.THREAD_MESSAGES_REFRESH,
        threadID: slackEvent?.channel,
      }])
    })

    await rtm.start()
  }
}
