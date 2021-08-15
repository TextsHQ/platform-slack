// node-emoji doesn't support skin tone, see https://github.com/omnidan/node-emoji/issues/57
import NodeEmoji from 'node-emoji'

export const skinToneShortcodeToEmojiMap = {
  ':skin-tone-2:': '🏻',
  ':skin-tone-3:': '🏼',
  ':skin-tone-4:': '🏽',
  ':skin-tone-5:': '🏾',
  ':skin-tone-6:': '🏿',
}
const skinToneEmojiToShortcodeMap = {
  '🏻': ':skin-tone-2:',
  '🏼': ':skin-tone-3:',
  '🏽': ':skin-tone-4:',
  '🏾': ':skin-tone-5:',
  '🏿': ':skin-tone-6:',
}

export function mapNativeEmojis(text: string): string {
  if (!text) return text

  const matches = text.match(/:([+A-Za-z0-9_-]+):/g)
  if (!matches) return text

  for (const shortcode of matches) {
    const emoji = NodeEmoji.get(shortcode) || skinToneShortcodeToEmojiMap[shortcode]
    if (emoji) {
      text = text.replace(shortcode, emoji)
    }
  }
  return text
}

export const emojiToShortcode = (emoji: string) => {
  for (const skinToneChar of Object.keys(skinToneEmojiToShortcodeMap)) {
    emoji = emoji.replace(skinToneChar, '')
  }
  return NodeEmoji.findByCode(emoji)?.key
}
