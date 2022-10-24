import { texts } from '@textshq/platform-sdk'

const timeLogEnabled = false

export const textsTime = (() =>
  (texts.isLoggingEnabled && timeLogEnabled ? (label: string) => {
    const newLabel = `${label} Tag: ${Math.random()}`
    console.time(newLabel)
    return {
      timeEnd: () => console.timeEnd(newLabel),
    }
  } : () => ({ timeEnd: () => {} }))
)()
