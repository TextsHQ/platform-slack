import { texts } from '@textshq/platform-sdk'
import { MESSAGE_REPLY_THREAD_PREFIX } from './constants'

const timeLogEnabled = false

export const textsTime = (() =>
  (texts.isLoggingEnabled && timeLogEnabled ? (label: string) => {
    const newLabel = `${label} Tag: ${Math.random()}`
    console.time(newLabel)
    return {
      timeEnd: () => console.timeEnd(newLabel),
    }
  } : (_: string) => ({ timeEnd: () => {} }))
)()

export const isMessageReply = (threadID: string) => (threadID || '').startsWith(MESSAGE_REPLY_THREAD_PREFIX)

export const isDM = (threadID: string) => (threadID || '').startsWith('D')

export const isChannel = (threadID: string) => (threadID || '').startsWith('C')
