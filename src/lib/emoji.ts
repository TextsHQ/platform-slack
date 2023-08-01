import slackEmoji from './slack-emoji.json'

const slackEmojiShortName = slackEmoji.reduce((map, currentEmoji) => {
  map.set(currentEmoji.short_name, { ...currentEmoji })
  return map
}, new Map())

const slackEmojiUnicode = slackEmoji.reduce((map, currentEmoji) => {
  const unicode = String.fromCodePoint(parseInt(currentEmoji.unified, 16))
  map.set(unicode, { ...currentEmoji })
  return map
}, new Map())

export const getEmojiUrl = (block: string): string => {
  const emojiSlug = block.replace(/:/g, '')
  const selectedEmoji = slackEmojiShortName.get(emojiSlug)

  if (selectedEmoji) return `https://a.slack-edge.com/production-standard-emoji-assets/14.0/apple-medium/${selectedEmoji.image}`

  return block
}

export const getEmojiUnicode = (block: string): string => {
  const emojiSlug = block.replace(/:/g, '')
  // @see https://stackoverflow.com/a/57796537
  if (emojiSlug === 'heart') return '❤️'

  const selectedEmoji = slackEmojiShortName.get(emojiSlug)
  if (selectedEmoji) return String.fromCodePoint(parseInt(selectedEmoji.unified, 16))

  return block
}

export const getSlug = (emoji: string): string => {
  // @see https://stackoverflow.com/a/57796537
  if (emoji === '❤️') return 'heart'

  const data = slackEmojiUnicode.get(emoji)
  return data?.short_name || emoji
}

export const getNativeShortcodeFromBlock = (block: string): string => {
  const emojiUnicode = getEmojiUnicode(block)
  return getSlug(emojiUnicode)
}
