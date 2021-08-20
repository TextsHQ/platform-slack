// node-emoji doesn't support skin tone, see https://github.com/omnidan/node-emoji/issues/57
import NodeEmoji from 'node-emoji'
import type { TextAttributes } from '../../platform-sdk/dist'

export const skinToneShortcodeToEmojiMap = {
  ':skin-tone-2:': '🏻',
  ':skin-tone-3:': '🏼',
  ':skin-tone-4:': '🏽',
  ':skin-tone-5:': '🏾',
  ':skin-tone-6:': '🏿',
}
const skinToneEmojiToShortcodeMap = {
  '🏻': 'skin-tone-2',
  '🏼': 'skin-tone-3',
  '🏽': 'skin-tone-4',
  '🏾': 'skin-tone-5',
  '🏿': 'skin-tone-6',
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
  let skinTone = ''
  for (const [skinToneChar, skinToneCode] of Object.entries(skinToneEmojiToShortcodeMap)) {
    if (emoji.includes(skinToneChar)) {
      skinTone += '::' + skinToneCode
      emoji = emoji.replace(skinToneChar, '')
    }
  }
  // @ts-expect-error missing type defs
  return NodeEmoji.findByCode(emoji)?.key + skinTone
}

export function mapTextAttributes0(
  src: string,
) : {
    text: string
    textAttributes: TextAttributes
  } {
  src = mapNativeEmojis(src)
  let text = ''
  let cursor = 0
  const entities = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const openIndex = src.indexOf('<http', cursor)
    const closeIndex = src.indexOf('>', openIndex)
    if (openIndex === -1 || closeIndex === -1) {
      // No possible links.
      text += src.slice(cursor)
      break
    }

    const matches = /^(https?:\/\/[^\s|]+)(|.*)?$/.exec(src.slice(openIndex + 1, closeIndex))
    if (!matches) {
      // Not really a link.
      const newCursor = openIndex + 5
      text += src.slice(cursor, newCursor)
      cursor = newCursor
      continue
    } else {
      // Really a link.
      text += src.slice(cursor, openIndex)
      // eslint-disable-next-line prefer-const
      let [, link, title] = matches
      const from = Array.from(text).length
      title = title?.slice(1) || link
      entities.push({
        from,
        to: from + Array.from(title).length,
        link,
      })
      text += title
      cursor = closeIndex + 1
    }
  }

  return {
    text,
    textAttributes: {
      entities,
      heDecode: true,
    },
  }
}

const getClosingToken = (token: string): string => (token === '<' ? '>' : token)

const findClosingIndex = (input: string[], curToken: string) => {
  const closingToken = getClosingToken(curToken)
  let closingIndex = input.indexOf(closingToken[0])
  let data
  if (closingIndex > -1) {
    let tokenMatched = true
    for (let i = 1; i < closingToken.length; i++) {
      // When token has more than one char, make sure the chars after the
      // closingIndex fully match token.
      if (input[closingIndex + i] !== closingToken[i]) {
        tokenMatched = false
        break
      }
    }
    if (curToken === '<') {
      const link = input.slice(0, closingIndex).join('')
      const matches = /^([^\s:]+:\/?\/?[^\s|]+)\|?(.*)?$/.exec(link)
      if (matches) {
        data = matches.slice(1)
      } else {
        tokenMatched = false
      }
    }
    if (tokenMatched) return { closingIndex, data }
  }
  return {
    closingIndex: -1,
    data
  }
}

export function mapTextAttributes(
  src: string,
) : {
  text: string
  textAttributes: TextAttributes
} {
  let output = ''
  let cursor = 0
  const entities = []
  let input = Array.from(mapNativeEmojis(src))

  // Parse the input sequentially.
  while (input.length) {
    const c1 = input[0]
    let curToken
    if ('*_~`<'.includes(c1)) {
      if (c1 === '`') {
        if (input[1] === '`' && input[2] === '`') {
          curToken = '```'
        } else {
          curToken = null
        }
      } else {
        curToken = c1
      }
    }
    if (curToken) {
      input = input.slice(curToken.length)
      const { closingIndex, data } = findClosingIndex(input, curToken)
      if (closingIndex > 0) {
        if (curToken === '<') {
          let [link, title] = data
          title = title || link
          const from = Array.from(output).length
          output += title
          entities.push({
            from,
            to: from + Array.from(title).length,
            link,
          })
        } else {
          output += input.slice(0, closingIndex).join('')
        }
        input = input.slice(closingIndex + curToken.length)
      } else {
        output += curToken
      }
    } else {
      // c1 is plain text!
      output += c1
      input = input.slice(1)
    }
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
  }
}
