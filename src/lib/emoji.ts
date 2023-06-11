import emojiData from 'unicode-emoji-json'

export const getEmoji = (block: string): string => {
  const emojiSlug = block.replace(/:/g, '')
  const [selectedEmoji] = Object.entries(emojiData).find(([, value]: [string, any]) => value.slug === emojiSlug || `face_with_${emojiSlug}` === value.slug || `${emojiSlug}_face` === value.slug) || []

  return selectedEmoji || block
}

export const getSlug = (emoji: string): string => {
  const data = emojiData[emoji]
  return data?.slug || emoji
}
