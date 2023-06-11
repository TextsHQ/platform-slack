import emojiData from 'unicode-emoji-json'

import slackEmoji from './slack-emoji.json'

export const getEmojiUrl = (block: string): string => {
  const emojiSlug = block.replace(/:/g, '')
  const selectedEmoji = slackEmoji.find(value => value.short_name === emojiSlug)

  if (selectedEmoji) return `https://a.slack-edge.com/production-standard-emoji-assets/14.0/apple-medium/${selectedEmoji.image}`

  return block
}

export const getEmojiUnicode = (block: string): string => {
  const emojiSlug = block.replace(/:/g, '')
  const selectedEmoji = slackEmoji.find(value => value.short_name === emojiSlug)

  if (selectedEmoji) return String.fromCodePoint(parseInt(selectedEmoji.unified, 16))

  return block
}

export const getSlug = (emoji: string): string => {
  const data = emojiData[emoji]
  return data?.slug || emoji
}

export const getNativeShortcodeFromBlock = (block: string): string => {
  const emojiUnicode = getEmojiUnicode(block)
  return getSlug(emojiUnicode)
}
