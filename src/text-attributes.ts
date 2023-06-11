// node-emoji doesn't support skin tone, see https://github.com/omnidan/node-emoji/issues/57
import NodeEmoji from 'node-emoji'

import { texts, TextAttributes, TextEntity, Message, MessageButton } from '@textshq/platform-sdk'
import { getEmojiUrl, getSlug } from './lib/emoji'

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
  // @ts-expect-error
  const key = NodeEmoji.findByCode(emoji)?.key
  if (key) return key + skinTone

  return getSlug(emoji)
}

const getClosingToken = (token: string): string => (
  {
    '<': '>',
  }[token] || token
)

const findClosingIndex = (input: string[], curToken: string) => {
  const closingToken = getClosingToken(curToken)
  const closingIndex = input.indexOf(closingToken[0])
  let data: string[]
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
  customEmojis: Record<string, string> = {},
): {
    text: string
    textAttributes: TextAttributes
  } {
  if (typeof src !== 'string') return
  let output = ''
  const entities = []
  let input = Array.from(mapNativeEmojis(src))

  // Parse the input sequentially.
  while (input.length) {
    const c1 = input[0]
    let curToken: string

    if (':*_~`<'.includes(c1)) {
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
        let nestedAttributes: { text: string, textAttributes: TextAttributes } = { text: '', textAttributes: undefined }
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
          case ':': {
            if (customEmojis[content]) {
              entity.replaceWithMedia = {
                mediaType: 'img',
                srcURL: customEmojis[content],
                size: {
                  width: 16,
                  height: 16,
                },
              }
            }
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
  text?: MrkdwnElement
  fields?: MrkdwnElement[]
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

type ImageBlock = {
  type: 'image'
  image_url: string
  alt_text?: string
  fallback: string
}

type VideoBlock = {
  type: 'video'
} & any

type ChannelBlock = {
  type: 'channel'
  channel_id?: string
}

type ContextBlock = {
  type: 'context'
  elements: MrkdwnElement[]
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
  UserElement |
  ImageBlock |
  VideoBlock |
  ChannelBlock |
  ContextBlock

const mapStyle = (style): Partial<TextEntity> => ({
  bold: style.bold,
  italic: style.italic,
  code: style.code,
  strikethrough: style.strike,
})

function mapBlock(block: Block, customEmojis: Record<string, string>): Pick<Message, 'text' | 'textAttributes' | 'buttons'> {
  let output = ''
  const entities: TextEntity[] = []
  const buttons: MessageButton[] = []

  switch (block.type) {
    case 'rich_text':
    case 'rich_text_section': {
      const mapped = mapBlocks(block.elements, customEmojis)
      const nestedEntities = offsetEntities(mapped.textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      buttons.push(...mapped.buttons)
      output += mapped.text
      break
    }
    case 'rich_text_list': {
      let i = 1
      for (const element of block.elements) {
        const listStyle = block.style === 'ordered' ? `${i}. ` : '• '
        const mapped = mapBlock(element, customEmojis)
        const cursor = Array.from(output).length + listStyle.length
        const nestedEntities = offsetEntities(mapped.textAttributes.entities, cursor)
        entities.push(...nestedEntities)
        buttons.push(...mapped.buttons)
        output += listStyle + mapped.text + '\n'
        i++
      }
      break
    }
    case 'rich_text_quote': {
      const mapped = mapBlocks(block.elements, customEmojis)
      const cursor = Array.from(output).length
      const nestedEntities = offsetEntities(mapped.textAttributes.entities, cursor)
      entities.push(...nestedEntities)
      buttons.push(...mapped.buttons)
      if (mapped.text) {
        // Add a quote entity.
        entities.push({
          from: cursor,
          to: Array.from(mapped.text).length,
          quote: true,
        })
      }
      output += mapped.text
      break
    }
    case 'rich_text_preformatted': {
      const mapped = mapBlocks(block.elements, customEmojis)
      const cursor = Array.from(output).length
      const nestedEntities = offsetEntities(mapped.textAttributes.entities, cursor)
      entities.push(...nestedEntities)
      buttons.push(...mapped.buttons)
      if (mapped.text) {
        // Add a pre entity.
        entities.push({
          from: cursor,
          to: Array.from(mapped.text).length,
          pre: true,
        })
      }
      output += mapped.text
      break
    }
    case 'text': {
      const from = Array.from(output).length
      output += block.text
      if (block.style) {
        const entity: TextEntity = {
          from,
          to: from + Array.from(block.text || '').length,
          ...block.style && mapStyle(block.style),
        }
        entities.push(entity)
      }
      break
    }
    case 'plain_text':
      output += mapNativeEmojis(block.text)
      break
    case 'link': {
      const title = block.text || block.url || ''
      const from = Array.from(output).length
      entities.push({
        from,
        to: from + Array.from(title).length,
        link: block.url,
        ...block.style && mapStyle(block.style),
      })
      output += title
      break
    }
    case 'emoji': {
      const emojiCode = `:${block.name}:`
      const emojiUrl = getEmojiUrl(emojiCode)

      // Native emojis.
      if (block.unicode) {
        const unicodeCharacter = String.fromCodePoint(parseInt(block.unicode, 16))
        output += unicodeCharacter
      } else {
        // Custom emojis.
        const from = Array.from(output).length
        const shouldReplace = customEmojis[block.name] || (emojiUrl !== emojiCode)

        if (shouldReplace) {
          entities.push({
            from,
            to: from + Array.from(block.name).length,
            replaceWithMedia: {
              mediaType: 'img',
              srcURL: customEmojis[block.name] || emojiUrl,
              size: {
                width: 16,
                height: 16,
              },
            },
          })
        }

        output += shouldReplace ? block.name : emojiCode
      }
      break
    }
    case 'section': {
      const fields = block.fields ?? [block.text]
      for (const field of fields) {
        const mapped = mapBlock(field, customEmojis)
        const cursor = Array.from(output).length
        const nestedEntities = offsetEntities(mapped.textAttributes.entities, cursor)
        entities.push(...nestedEntities)
        buttons.push(...mapped.buttons)
        output += mapped.text + '\n'
      }
      break
    }
    case 'mrkdwn': {
      const mapped = mapTextAttributes(block.text, false, customEmojis)
      const nestedEntities = offsetEntities(mapped.textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      output += mapped.text
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
    case 'context':
      {
        const mapped = mapBlocks(block.elements, customEmojis)
        const cursor = Array.from(output).length
        const nestedEntities = offsetEntities(mapped.textAttributes.entities, cursor)
        entities.push(...nestedEntities)
        buttons.push(...mapped.buttons)
        if (mapped.text) {
          entities.push({
            from: cursor,
            to: Array.from(mapped.text).length,
            pre: true,
          })
        }
        output += mapped.text
      }
      break
    case 'image': {
      const text = block.alt_text || block.fallback || block.image_url
      const from = Array.from(output).length

      entities.push({
        from,
        to: from + Array.from(text).length,
        replaceWithMedia: {
          mediaType: 'img',
          srcURL: block.image_url,
        },
      })
      output += text
      break
    }
    case 'video': {
      const text = block.title?.text
      const from = Array.from(output).length

      entities.push({
        from,
        to: from + Array.from(text).length,
        replaceWithMedia: {
          mediaType: 'img',
          srcURL: block.thumbnail_url,
        },
      })
      output += text
      break
    }
    case 'channel': {
      const from = Array.from(output).length
      const text = block.channel_id
      output += text
      entities.push({
        from,
        to: from + Array.from(text).length,
        replaceWith: '#' + block.channel_id, // todo: should be proper channel
        ...block.style && mapStyle(block.style),
      })
      break
    }
    case 'usergroup': {
      const from = Array.from(output).length
      const text = block.usergroup_id
      output += text
      entities.push({
        from,
        to: from + Array.from(text).length,
        replaceWith: '@' + block.usergroup_id, // todo: should be proper channel
        ...block.style && mapStyle(block.style),
      })
      break
    }
    case 'divider':
      output += '\n---\n'
      break
    case 'actions':
      block.elements.forEach(element => {
        if (element.type === 'button' && element.text) {
          buttons.push({
            label: element.text.text,
            linkURL: 'texts://fill-textarea?text=Unsupported',
          })
        } else {
          console.log('slack: unknown element type', element.type)
        }
      })
      break
    case 'header': {
      const innerBlock = mapBlock(block.text, customEmojis)
      const cursor = Array.from(output).length
      const nestedEntities = offsetEntities(innerBlock.textAttributes.entities, cursor)
      entities.push(...nestedEntities)
      buttons.push(...innerBlock.buttons)
      output += innerBlock.text + '\n\n'
      entities.push({
        from: cursor,
        to: cursor + innerBlock.text.length,
        bold: true,
      })
      break
    }
    default:
      output += `\n---⚠️ Texts didn't render Slack ${block.type} block ⚠️---\n`
      texts.Sentry.captureMessage('slack unrecognized block: ' + block.type, { extra: { tags: Object.keys(block) } })
      texts.log('slack: unrecognized block', block)
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
    buttons,
  }
}

export function mapBlocks(blocks: Block[], customEmojis: Record<string, string>): Pick<Message, 'text' | 'textAttributes' | 'buttons'> {
  let output = ''
  const entities: TextEntity[] = []
  const buttons: MessageButton[] = []

  for (const block of blocks) {
    if (block) {
      const mapped = mapBlock(block, customEmojis)
      const nestedEntities = offsetEntities(mapped.textAttributes.entities, Array.from(output).length)
      entities.push(...nestedEntities)
      buttons.push(...mapped.buttons)
      output += mapped.text
    }
  }

  return {
    text: output,
    textAttributes: {
      entities,
      heDecode: true,
    },
    buttons,
  }
}
