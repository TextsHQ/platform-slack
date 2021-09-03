// node-emoji doesn't support skin tone, see https://github.com/omnidan/node-emoji/issues/57
import NodeEmoji from 'node-emoji'
import { texts, TextAttributes, TextEntity } from '@textshq/platform-sdk'

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

const getClosingToken = (token: string): string => (
  {
    '<': '>',
  }[token] || token
)

const findClosingIndex = (input: string[], curToken: string) => {
  const closingToken = getClosingToken(curToken)
  const closingIndex = input.indexOf(closingToken[0])
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
    data,
  }
}

// When merging in nested entities, need to adjust the ranges.
export const offsetEntities = (entities: TextEntity[], offset: number): TextEntity[] =>
  entities.map(entity => ({
    ...entity,
    from: entity.from + offset,
    to: entity.to + offset,
  }))

export function mapTextAttributes(
  src: string,
  wrapInQuote = false,
) : {
    text: string
    textAttributes: TextAttributes
  } {
  let output = ''
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
          curToken = '`'
        }
      } else {
        curToken = c1
      }
    }
    if (curToken) {
      input = input.slice(curToken.length)
      const { closingIndex, data } = findClosingIndex(input, curToken)
      if (closingIndex > 0) {
        // A valid closingIndex is found, it's a valid token!
        const content = input.slice(0, closingIndex).join('')
        // See if we can find nested entities.
        let nestedAttributes = { text: '', textAttributes: undefined }
        if (!['```', '<'].includes(curToken)) {
          nestedAttributes = mapTextAttributes(content)
        }
        // Construct the entity of the current token.
        const from = Array.from(output).length
        let to = from + closingIndex
        if (nestedAttributes.textAttributes) {
          // Nested entities change the output, so update the range.
          to = from + nestedAttributes.text.length
          // Offset the range of child entities.
          const childEntities = nestedAttributes.textAttributes.entities.map(entity => ({
            ...entity,
            from: entity.from + from,
            to: entity.to + from,
          }))
          entities.push(...childEntities)
          output += nestedAttributes.text
        }
        const entity: TextEntity = {
          from,
          to,
        }
        switch (curToken) {
          case '*':
            entity.bold = true
            break
          case '_':
            entity.italic = true
            break
          case '~':
            entity.strikethrough = true
            break
          case '`':
            entity.code = true
            break
          case '<': {
            let [link, title] = data
            title = title || link
            output += title
            entity.to = from + Array.from(title).length
            entity.link = link
            break
          }
          default:
            output += input.slice(0, closingIndex).join('')
        }
        entities.push(entity)
        // Set input to start from the char after the closing token.
        input = input.slice(closingIndex + curToken.length)
      } else {
        // Unable to find a valid closingIndex, curToken is plain text!
        output += curToken
      }
    } else {
      // c1 is plain text!
      output += c1
      input = input.slice(1)
    }
  }

  if (wrapInQuote) {
    entities.push({
      from: 0,
      to: Array.from(output).length,
      quote: true,
    })
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
  }
}

interface BaseParentBlock {
  type: string
  elements: Block[]
}

interface RichTextBlock extends BaseParentBlock {
  type: 'rich_text' | 'rich_text_section'
}

interface QuoteBlock extends BaseParentBlock {
  type: 'rich_text_quote'
}

interface PreformattedBlock extends BaseParentBlock {
  type: 'rich_text_preformatted'
}

interface ListBlock extends BaseParentBlock {
  type: 'rich_text_list'
  style: 'bullet' | 'ordered'
}

type TextElement = {
  type: 'text'
  text: string
  style?: {
    bold?: boolean
    italic?: boolean
    strike?: boolean
    code?: boolean
  }
}

type LinkElement = {
  type: 'link'
  url: string
  text?: string
}

type EmojiElement = {
  type: 'emoji'
  name: string
}

type SectionBlock = {
  type: 'section'
  text: MrkdwnElement
}

type MrkdwnElement = {
  type: 'mrkdwn'
  text: string
  verbatim: boolean
}

type UserElement = {
  type: 'user'
  user_id: string
  profile: {
    real_name: string
    display_name: string
  }
}

export type Block =
  RichTextBlock |
  QuoteBlock |
  ListBlock |
  PreformattedBlock |
  TextElement |
  LinkElement |
  EmojiElement |
  SectionBlock |
  MrkdwnElement |
  UserElement

const mapBlock = (block: Block, customEmojis: Record<string, string>) : {
  text: string
  textAttributes: TextAttributes
} => {
  let output = ''
  const entities = []

  switch (block.type) {
    case 'rich_text':
    case 'rich_text_section': {
      const { text, textAttributes } = mapBlocks(block.elements, customEmojis)
      const nestedEntities = offsetEntities(textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      output += text
      break
    }
    case 'rich_text_list': {
      let i = 1;
      for (const element of block.elements) {
        const listStyle = block.style === 'ordered' ? `${i}. ` : '• '
        const { text, textAttributes } = mapBlock(element, customEmojis)
        const cursor = Array.from(output).length + listStyle.length
        const nestedEntities = offsetEntities(textAttributes.entities, cursor)
        entities.push(...nestedEntities)

        output += listStyle + text + '\n'
        i++
      }
      break
    }
    case 'rich_text_quote': {
      const { text, textAttributes } = mapBlocks(block.elements, customEmojis)
      const cursor = Array.from(output).length
      const nestedEntities = offsetEntities(textAttributes.entities, cursor)
      entities.push(...nestedEntities)
      if (text) {
        // Add a quote entity.
        entities.push({
          from: cursor,
          to: Array.from(text).length,
          quote: true,
        })
      }
      output += text
      break
    }
    case 'rich_text_preformatted': {
      const { text, textAttributes } = mapBlocks(block.elements, customEmojis)
      const cursor = Array.from(output).length
      const nestedEntities = offsetEntities(textAttributes.entities, cursor)
      entities.push(...nestedEntities)
      if (text) {
        // Add a pre entity.
        entities.push({
          from: cursor,
          to: Array.from(text).length,
          pre: true,
        })
      }
      output += text
      break
    }
    case 'text': {
      const from = Array.from(output).length
      output += block.text
      if (block.style) {
        const entity: TextEntity = {
          from,
          to: from + Array.from(block.text || '').length,
        }
        if (block.style.bold) {
          entity.bold = true
        }
        if (block.style.italic) {
          entity.italic = true
        }
        if (block.style.strike) {
          entity.strikethrough = true
        }
        if (block.style.code) {
          entity.code = true
        }
        entities.push(entity)
      }
      break
    }
    case 'link': {
      const title = block.text || block.url || ''
      const from = Array.from(output).length
      entities.push({
        from,
        to: from + Array.from(title).length,
        link: block.url,
      })
      output += title
      break
    }
    case 'emoji': {
      const emojiCode = `:${block.name}:`
      const emoji = NodeEmoji.emojify(emojiCode)
      if (emoji !== emojiCode) {
        // Native emojis.
        output += NodeEmoji.emojify(`:${block.name}:`)
      } else {
        // Custom emojis.
        const from = Array.from(output).length
        if (customEmojis[block.name]) {
          entities.push({
            from,
            to: from + Array.from(block.name).length,
            replaceWithMedia: {
              mediaType: 'img',
              srcURL: customEmojis[block.name],
              size: {
                width: 16,
                height: 16,
              },
            },
          })
        }
        output += block.name
      }
      break
    }
    case 'section': {
      const { text, textAttributes } = mapBlock(block.text, customEmojis)
      const nestedEntities = offsetEntities(textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      output += text
      break
    }
    case 'mrkdwn': {
      const { text, textAttributes } = mapTextAttributes(block.text)
      const nestedEntities = offsetEntities(textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      output += text
      break
    }
    case 'user': {
      const from = Array.from(output).length
      const username = block.profile?.display_name || block.profile?.real_name || ''
      entities.push({
        from,
        to: from + Array.from(username).length + 1,
        mentionedUser: {
          username,
          id: block.user_id,
        },
      })
      output += `@${username}`
      break
    }
    default:
      texts.log('Unrecognized block:', block)
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
  }
}

export const mapBlocks = (blocks: Block[], customEmojis: Record<string, string>) : {
  text: string
  textAttributes: TextAttributes
} => {
  let output = ''
  const entities = []

  for (const block of blocks) {
    const { text, textAttributes } = mapBlock(block, customEmojis)
    const nestedEntities = offsetEntities(textAttributes.entities, Array.from(output).length)
    entities.push(...nestedEntities)
    output += text
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
  }
}
