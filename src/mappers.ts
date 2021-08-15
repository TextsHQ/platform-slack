import NodeEmoji from 'node-emoji'
import { CurrentUser, Message, MessageAction, MessageActionType, MessageAttachment, MessageAttachmentType, MessageButton, MessageReaction, Participant, ServerEvent, ServerEventType, TextAttributes, TextEntity, Thread } from '@textshq/platform-sdk'
import type { ImageBlock, KnownBlock } from '@slack/web-api'

import { BOLD_REGEX, LINK_REGEX } from './constants'
import { removeCharactersAfterAndBefore } from './util'
import { mapNativeEmojis, skinToneShortcodeToEmojiMap } from './text-attributes'

const getAttachmentType = (mimeType: string): MessageAttachmentType => {
  if (mimeType?.startsWith('image')) return MessageAttachmentType.IMG
  if (mimeType?.startsWith('video')) return MessageAttachmentType.VIDEO
  if (mimeType?.startsWith('audio')) return MessageAttachmentType.AUDIO
  return MessageAttachmentType.UNKNOWN
}

const mapAttachment = (slackAttachment: any): MessageAttachment => {
  if (!slackAttachment || !slackAttachment?.mimetype) return

  const type = getAttachmentType(slackAttachment.mimetype)
  return {
    id: slackAttachment.id,
    fileName: slackAttachment.name,
    type,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(slackAttachment.url_private).toString('hex'),
    mimeType: slackAttachment.mimetype,
  }
}

const mapAttachments = (slackAttachments: any[]): MessageAttachment[] => {
  if (!slackAttachments?.length) return []
  return slackAttachments.map(mapAttachment)
}

const mapAttachmentBlock = (slackBlock: KnownBlock) => {
  const { type: slackType } = slackBlock
  if (slackType !== 'image') return
  const block = slackBlock as ImageBlock
  return {
    id: block.image_url,
    type: MessageAttachmentType.IMG,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(block.image_url).toString('hex'),
  }
}

export const extractRichElements = (slackBlocks: any): any[] => {
  const validTypes = ['rich_text', 'context']
  const richTexts = slackBlocks?.filter(({ type }) => validTypes.includes(type)) || []
  const sectionTexts = slackBlocks?.filter(({ type, text }) => type === 'section' && text) || []
  const calls = slackBlocks?.filter(({ type }) => type === 'call') || []
  // Schema:
  // "blocks": [
  //   {
  //     "type": "rich_text",
  //     "block_id": "3FsSx",
  //     "elements": [
  //       {
  //         "type": "rich_text_section",
  //         "elements": [
  //           {
  //             "type": "user",
  //             "user_id": "UHA5FTK1V"
  //           },
  //         ]
  //       }
  //     ]
  //   }
  // ],
  const extractElements = ({ elements }) => elements || []
  const richElements = richTexts?.flatMap(extractElements).flatMap(extractElements).filter(Boolean) || []
  const sectionElements = sectionTexts?.map(({ text }) => text) || []

  return [...richElements, ...sectionElements, ...calls]
}

/**
 * FIXME: This NEEDS to be refactored and fixed. It uses a lot of logic that needs to be generalized and documented
 *
 * @param text
 * @returns
 */
const getQuotesEntities = (text: string): { entities: TextEntity[], mappedText: string, offset: number } => {
  if (!text.includes('&gt;')) return { entities: [], mappedText: text, offset: 0 }

  const quotesEntities: TextEntity[] = []
  let mappedText = text.replace(/&gt;/g, '>')
  let offset = 0

  if (mappedText[0] === '>') {
    mappedText = mappedText.slice(2)
    offset += 5

    const to = mappedText.includes('\n') ? Array.from(mappedText).indexOf('\n') : Array.from(mappedText).length
    const isLink = mappedText.slice(0, to + 1).startsWith('<') && mappedText.slice(0, to).endsWith('>')

    quotesEntities.push({
      from: 0,
      to: isLink ? to - 2 : to,
      quote: true,
    })
  }

  const newLineQuotes = mappedText.match(/(\n>)/g) || []
  let previousFrom = Array.from(mappedText).indexOf('>') || 0
  let counter = 1

  while (counter <= newLineQuotes.length) {
    const arrayText = Array.from(mappedText)

    const from = arrayText.indexOf('>', previousFrom)
    const to = arrayText.indexOf('\n', from)

    if (arrayText[from - 1] === '\n') {
      quotesEntities.push({
        from,
        to: to > 0 ? to : Array.from(mappedText).length,
        quote: true,
      })

      mappedText = `${arrayText.slice(0, from).join('')}${arrayText.slice(from + 1).join('')}`
      previousFrom = from
      // offset += 2
      counter += 1
    } else {
      previousFrom += 1
    }
  }

  return { entities: quotesEntities, mappedText, offset }
}

const mapTextWithoutBlocks = (text: string) => {
  const entities: TextEntity[] = []

  let mappedText = text
  const boldElements = text.match(BOLD_REGEX) || []

  for (const element of boldElements) {
    const onlyText = element.slice(1, -1)
    mappedText = removeCharactersAfterAndBefore(mappedText, onlyText)
    const from = mappedText.indexOf(onlyText)
    entities.push({ from, to: from + onlyText.length, bold: true })
  }

  return { entities, text: mappedText }
}

const mapBlocks = (slackBlocks: any[], text = '', emojis: Record<string, string> = {}) => {
  const attachments = slackBlocks?.map(mapAttachmentBlock).filter(Boolean)
  const richElements = extractRichElements(slackBlocks)

  let mappedText = text
  let entities: TextEntity[] = []
  const buttons: MessageButton[] = []

  if (!richElements?.length && text) {
    const mappedWithoutBlocks = mapTextWithoutBlocks(text)
    entities = mappedWithoutBlocks.entities
    mappedText = mappedWithoutBlocks.text
  }

  for (const element of richElements) {
    const { type = '', style, text: blockText, url: blockUrl, user_id: blockUser, profile: blockProfile, name: blockEmojiName } = element

    if (type === 'text' && style && blockText) {
      mappedText = removeCharactersAfterAndBefore(mappedText, blockText)
      const from = mappedText.indexOf(blockText)
      entities.push({ from, to: from + blockText.length, ...style })
    }

    if (type === 'mrkdwn' && blockText) mappedText = `${mappedText}\n${blockText}`

    if (type === 'link' && blockUrl) {
      const linkAndText = blockText ? `${blockUrl}|${blockText}` : blockUrl
      mappedText = removeCharactersAfterAndBefore(mappedText, linkAndText)

      const linkText = blockText || blockUrl
      if (blockText) mappedText = mappedText.replace(`${blockUrl}|`, '')

      const from = mappedText.indexOf(linkText)
      entities.push({ from, to: from + linkText.length, link: blockUrl })
    }

    if (type === 'user' && blockUser) {
      const username = blockProfile?.display_name || blockProfile?.real_name || blockUser

      if (!mappedText.includes(username)) mappedText = mappedText.replace(blockUser, username)
      if (mappedText.includes('<@')) mappedText = removeCharactersAfterAndBefore(mappedText, `@${username}`)
      else mappedText = mappedText.replace(username, `@${username}`)

      const from = mappedText.indexOf(`@${username}`)
      entities.push({ from, to: from + username.length + 1, mentionedUser: { id: blockUser, username } })
    }

    if (type === 'channel' && element?.channel_id) {
      const initialIndex = mappedText.indexOf(`<#${element?.channel_id}`)
      const finalIndex = mappedText.indexOf('>', initialIndex)
      const channelLinkAndName = mappedText.slice(initialIndex + 1, finalIndex)
      const channelName = channelLinkAndName.split('|').pop()

      mappedText = removeCharactersAfterAndBefore(mappedText, channelLinkAndName)
      mappedText = mappedText.replace(`#${element?.channel_id}`, '')
      mappedText = mappedText.replace(`|${channelName}`, `#${channelName}`)

      const from = mappedText.indexOf(channelName) - 1
      const to = from + channelName.length + 1

      entities.push({ from, to, link: `texts://select-thread/slack/${element?.channel_id}` })
    }

    if (type === 'emoji' && blockEmojiName && mappedText.includes(blockEmojiName)) {
      mappedText = removeCharactersAfterAndBefore(mappedText, blockEmojiName)
      const from = mappedText.indexOf(blockEmojiName)
      entities.push({
        from,
        to: from + blockEmojiName.length,
        replaceWithMedia: {
          mediaType: 'img',
          srcURL: emojis[blockEmojiName],
          size: {
            width: mappedText.length === blockEmojiName.length ? 32 : 16,
            height: mappedText.length === blockEmojiName.length ? 32 : 16,
          },
        },
      })
    }
    // This is added for some apps like "Zoom" or "Meet".
    if (type === 'call' && element?.call?.v1) {
      const { join_url } = element?.call?.v1
      buttons.push({ linkURL: join_url, label: 'Join' })
    }
  }

  const quotesEntities = getQuotesEntities(mappedText)
  const entitiesWithQuotesOffset = entities.map(entity => ({
    ...entity,
    from: entity.from - quotesEntities.offset,
    to: entity.to - quotesEntities.offset,
  }))

  return {
    attachments,
    textAttributes: { entities: [...entitiesWithQuotesOffset, ...quotesEntities.entities] },
    mappedText: quotesEntities.mappedText,
    buttons,
  }
}

export const mapAction = (slackMessage: any): MessageAction => {
  const actions = ['channel_join', 'channel_leave']
  if (!actions.includes(slackMessage?.subtype)) return

  const type: MessageActionType = (() => {
    switch (slackMessage.subtype) {
      case 'channel_join':
        return MessageActionType.THREAD_PARTICIPANTS_ADDED

      case 'channel_leave':
        return MessageActionType.THREAD_PARTICIPANTS_REMOVED

      default:
        break
    }
  })()

  return {
    type,
    participantIDs: [slackMessage?.user],
    actorParticipantID: slackMessage?.user,
  }
}

const mapTextWithLinkEntities = (slackText: string): { attributes: TextAttributes, text: string } => {
  const found = slackText?.match(LINK_REGEX)
  if (!found) return { attributes: {}, text: slackText }

  const entities: TextEntity[] = []
  let finalText = slackText

  for (const linkFound of found) {
    const linkAndText = linkFound.slice(1, linkFound.length - 1)
    finalText = removeCharactersAfterAndBefore(finalText, linkAndText)

    const text = linkAndText.includes('|') ? linkAndText.split('|').pop() : ''
    const link = linkAndText.includes('|') ? linkAndText.split('|')[0] : linkAndText

    if (text) finalText = finalText.replace(`${link}|`, link.includes('#') ? '#' : '')

    const from = text ? finalText.indexOf(text) : finalText.indexOf(link)
    const to = from + (text ? text.length : link.length)
    entities.push({ from, to, link })
  }

  return { attributes: { entities }, text: finalText }
}

export const mapReactionKey = (shortcode: string, customEmojis: Record<string, string>) =>
  customEmojis[shortcode] || shortcode

/** takes a shortcode argument like `+1` and returns '👍' */
export const shortcodeToEmoji = (shortcode: string) =>
  NodeEmoji.findByName(shortcode)?.emoji || skinToneShortcodeToEmojiMap[shortcode]

const mapReactions = (
  slackReactions: { name: string; users: string[]; count: number }[],
  customEmojis: Record<string, string>,
): MessageReaction[] => {
  if (!slackReactions?.length) return []

  const reactions = slackReactions?.flatMap(reaction => reaction.users.map(user => ({ ...reaction, user })))

  return reactions.map(reaction => {
    const emoji = shortcodeToEmoji(reaction.name)
    return {
      id: `${reaction.user}${emoji || reaction.name}`,
      participantID: reaction.user,
      reactionKey: emoji || mapReactionKey(reaction.name, customEmojis),
      emoji: !!emoji,
    }
  })
}

const mapAttachmentsText = (attachments: any[]): string => {
  if (!attachments?.length) return ''

  return attachments
    .reduce((prev: string, current: Record<string, string>) => `${prev}${current?.pretext ? `\n${current?.pretext}` : ''}\n&gt; ${current?.text}`, '')
    // Remove the first character '\n'
    .slice(1)
}

export const mapMessage = (slackMessage: any, currentUserId: string, customEmojis: Record<string, string>): Message => {
  const timestamp = new Date(Number(slackMessage?.ts) * 1000)
  const senderID = slackMessage?.user || slackMessage?.bot_id || 'none'

  const text = mapNativeEmojis(slackMessage?.text)
    || mapNativeEmojis(slackMessage?.attachments?.map(attachment => attachment.title).join(' '))
    || mapNativeEmojis(mapAttachmentsText(slackMessage?.attachments))
    || ''
  // This is done because bot messages have 'This content can't be displayed' as text field. So doing this
  // we avoid to concatenate that to the real message (divided in sections).
  const blocksText = text !== "This content can't be displayed" ? text : ''
  const blocks = mapBlocks(slackMessage?.blocks, blocksText, customEmojis)

  const attachments = [
    ...(mapAttachments(slackMessage?.files) || []),
    ...(blocks.attachments || []),
  ]

  const links = mapTextWithLinkEntities(mapNativeEmojis(blocks.mappedText) || text)

  const textAttributes: TextAttributes = {
    entities: [
      ...(blocks.textAttributes.entities || []),
      ...(links.attributes.entities || []),
    ],
    heDecode: true,
  }

  const mappedText = links.text

  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage?.ts,
    text: mappedText,
    timestamp,
    attachments,
    editedTimestamp: slackMessage.edited?.ts ? new Date(Number(slackMessage.edited?.ts) * 1000) : undefined,
    reactions: mapReactions(slackMessage.reactions, customEmojis) || [],
    senderID,
    isSender: currentUserId === senderID,
    textAttributes,
    buttons: blocks.buttons || undefined,
    isAction: Boolean(mapAction(slackMessage)),
    action: mapAction(slackMessage) || undefined,
    linkedMessageID: !slackMessage?.reply_count ? (slackMessage?.thread_ts || undefined) : undefined,
  }
}

export const mapParticipant = ({ profile }: any): Participant => profile && {
  id: profile.api_app_id || profile.id,
  username: profile.display_name || profile.real_name || profile.name,
  fullName: profile.real_name || profile.display_name,
  imgURL: profile.image_192 || profile.image_72,
}

export const mapCurrentUser = ({ profile, team }: any): CurrentUser => ({
  id: profile.id,
  fullName: profile.real_name,
  displayText: `${team?.name + ' - '}${profile.display_name || profile.real_name}`,
  imgURL: profile.image_192,
})

export const mapProfile = (user: any): Participant => ({
  id: user.id,
  username: user?.profile?.name || user.name,
  fullName: user?.profile?.real_name || user?.profile?.display_name || user.name,
  imgURL: user?.profile?.image_192 || '',
})

const mapThread = (slackChannel: any, currentUserId: string, customEmojis: Record<string, string>): Thread => {
  const messages = (slackChannel?.messages as any[])?.map(message => mapMessage(message, currentUserId, customEmojis)) || []
  const participants = (slackChannel?.participants as any[])?.map(mapParticipant).filter(Boolean) || []

  const getType = () => {
    if (slackChannel.is_group) return 'group'
    if (slackChannel.is_channel) return 'channel'
    return 'single'
  }

  return {
    _original: JSON.stringify(slackChannel),
    id: slackChannel.id,
    type: getType(),
    title: slackChannel?.name || participants[0]?.username || slackChannel?.user,
    timestamp: messages[0]?.timestamp || slackChannel?.timestamp,
    isUnread: slackChannel?.unread || false,
    isReadOnly: slackChannel?.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
  }
}

export const mapThreads = (slackChannels: any[], currentUserId: string, customEmojis: Record<string, string>) =>
  slackChannels.map(thread => mapThread(thread, currentUserId, customEmojis))

export function mapEmojiChangedEvent(event: any): ServerEvent[] {
  if (event.value?.startsWith('alias:')) return []

  switch (event.subtype) {
    case 'add':
      return [{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {},
        mutationType: 'upsert',
        objectName: 'custom_emoji',
        entries: [{
          id: event.name,
          url: event.value,
        }],
      }]

    case 'remove':
      return [{
        type: ServerEventType.STATE_SYNC,
        objectIDs: {},
        mutationType: 'delete',
        objectName: 'custom_emoji',
        entries: event.names,
      }]

    case 'rename':
      return [
        {
          type: ServerEventType.STATE_SYNC,
          objectIDs: {},
          mutationType: 'delete',
          objectName: 'custom_emoji',
          entries: [event.old_name],
        },
        {
          type: ServerEventType.STATE_SYNC,
          objectIDs: {},
          mutationType: 'upsert',
          objectName: 'custom_emoji',
          entries: [{
            id: event.new_name,
            url: event.value,
          }],
        },
      ]
  }
}
