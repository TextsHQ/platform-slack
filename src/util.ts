import { texts } from '@textshq/platform-sdk'

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

export const isDM = (threadID: string) => (threadID || '').startsWith('D')

export const isChannel = (threadID: string) => (threadID || '').startsWith('C')
  // @notes
  // we still need to confirm this, there's no official documentation about this but seems like
  // groups are considered channels but they have reserved prefix: `C0`.
  && (threadID || '').startsWith('C0')
