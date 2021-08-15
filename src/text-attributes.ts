import NodeEmoji from 'node-emoji'

const skinTones = {
  ':skin-tone-2:': '🏻',
  ':skin-tone-3:': '🏼',
  ':skin-tone-4:': '🏽',
  ':skin-tone-5:': '🏾',
  ':skin-tone-6:': '🏿',
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
