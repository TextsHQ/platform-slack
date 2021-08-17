import WebSocket, { MessageEvent } from 'ws'
import { OnServerEventCallback, texts } from '@textshq/platform-sdk'

import type SlackAPI from './slack'

export default class WSClient {
  private ws?: WebSocket

  private sessionID?: number | undefined

  private lastSequenceNumber?: number | undefined

  private resumeConnectionOnConnect = false

  private heartbeatInterval?: NodeJS.Timeout

  ready = false

  restartOnFail = true

  onChangedReadyState?: (ready: boolean) => void

  onError?: (error: Error) => void

  onConnectionClosed?: (code: number, reason: string) => void

  constructor(
    private api: SlackAPI,
    private onEvent: OnServerEventCallback,
  ) {
    this.connect()
  }

  connect = async () => {
    // texts.log('[discord ws] Opening gateway connection...')
    this.ws = new WebSocket(`wss://wss-primary.slack.com/?token=${'xoxc-1837734959632-1995289676342-2002431890547-80f2bb9c6fcbf7081d5fa14993d5fa4308627add8130ab28f3d483d09d745f86'}&sync_desync=1&slack_client=desktop&start_args=%3Fagent%3Dclient%26org_wide_aware%3Dtrue%26agent_version%3D1628867849%26eac_cache_ts%3Dtrue%26cache_ts%3D0%26name_tagging%3Dtrue%26only_self_subteams%3Dtrue%26connect_only%3Dtrue%26ms_latest%3Dtrue&no_query_on_subscribe=1&flannel=3&lazy_channels=1&batch_presence_aware=1`, { headers: {
      'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
      // 'Sec-WebSocket-Key': '3KVLNW/TD1TNgmhfzBU6Iw==',
      'Sec-WebSocket-Version': 13,
    } })
    this.setupHandlers()
  }

  disconnect = () => {
    clearInterval(this.heartbeatInterval)
    this.lastSequenceNumber = null
    this.ws?.close()
  }

  private setupHandlers = () => {
    this.ws?.on('open', () => {
      console.log('HELLO')
    })

    this.ws?.on('close', (code, reason) => {
      this.ready = false
      this.onChangedReadyState?.(false)
      this.onConnectionClosed?.(code, reason)
    })

    this.ws?.on('error', error => this.onError?.(error))

    this.ws?.on('unexpected-response', (request, response) => {
      texts.log('[discord ws] Unexpected response: ' + request, response)
    })

    this.ws.onmessage = this.wsOnMessage
  }

  private send = payload => {
    // if (this.ws.readyState === this.ws.CONNECTING) {
    //   return this.waitAndSend(payload)
    // }
    this.ws.send(payload)
  }

  private wsOnMessage = (event: MessageEvent) => {
    console.log({ event })
  }

  dispose = async () => {
    this.ws?.close()
  }
}
