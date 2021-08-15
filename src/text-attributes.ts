// node-emoji doesn't support skin tone, see https://github.com/omnidan/node-emoji/issues/57
import NodeEmoji from 'node-emoji'

const skinTones = {
  ':skin-tone-2:': '🏻',
  ':skin-tone-3:': '🏼',
  ':skin-tone-4:': '🏽',
  ':skin-tone-5:': '🏾',
  ':skin-tone-6:': '🏿',
}

function getSkinToneCode(emoji: string): string {
  for (const [code, tone] of Object.entries(skinTones)) {
    if (tone == emoji) {
      return code
    }
  }
}

export function mapNativeEmojis(text: string): string {
  if (!text) return text

  const matches = text.match(/:([+A-Za-z0-9_-]+):/g)
  if (!matches) return text

  for (let name of matches) {
    const emoji = NodeEmoji.get(name) || skinTones[name]
    if (emoji) {
      text = text.replace(name, emoji)
    }
  }
  return text
}

export function emojisToCode(emojis: string): string {
  return Array.from(emojis)
    .map(emoji => {
      const code = NodeEmoji.find(emoji)?.key || getSkinToneCode(emoji)
      if (code) return `:${code}:`
    })
    .join('')
}
