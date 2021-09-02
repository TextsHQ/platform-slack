import NodeEmoji from 'node-emoji'
import { truncate } from 'lodash'
import { CurrentUser, Message, MessageAction, MessageActionType, MessageAttachment, MessageAttachmentType, MessageLink, MessageReaction, Participant, ServerEvent, ServerEventType, TextAttributes, TextEntity, Thread, Tweet } from '@textshq/platform-sdk'
import type { ImageBlock, KnownBlock } from '@slack/web-api'
import type { Message as CHRMessage } from '@slack/web-api/dist/response/ConversationsHistoryResponse'

import { BOLD_REGEX, LINK_REGEX } from './constants'
import { removeCharactersAfterAndBefore } from './util'
import { mapTextAttributes, skinToneShortcodeToEmojiMap, mapBlocks, offsetEntities } from './text-attributes'

const getAttachmentType = (mimeType: string): MessageAttachmentType => {
  if (mimeType?.startsWith('image')) return MessageAttachmentType.IMG
  if (mimeType?.startsWith('video')) return MessageAttachmentType.VIDEO
  if (mimeType?.startsWith('audio')) return MessageAttachmentType.AUDIO
  return MessageAttachmentType.UNKNOWN
}

const mapAttachment = (slackAttachment: any): MessageAttachment => {
  let mimeType = slackAttachment?.mimetype
  if (slackAttachment?.image_url) mimeType = 'image'

  if (!slackAttachment || !mimeType) return

  const type = getAttachmentType(mimeType)
  const url = slackAttachment.url_private
    ? 'asset://$accountID/proxy/' + Buffer.from(slackAttachment.url_private).toString('hex')
    : slackAttachment.image_url

  return {
    id: slackAttachment.id,
    fileName: slackAttachment.name || 'image',
    type,
    mimeType,
    srcURL: url,
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

export const mapAction = (slackMessage: CHRMessage): MessageAction => {
  const actions = ['channel_join', 'channel_leave']
  if (!actions.includes(slackMessage.subtype)) return

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
    participantIDs: [slackMessage.user],
    actorParticipantID: slackMessage.user,
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

/** takes a shortcode argument like `+1` or `+1::skin-tone-4` and returns '👍' or '👍🏽' */
export const shortcodeToEmoji = (shortcode: string) => {
  if (shortcode.includes('::')) {
    const [code, skinTone] = shortcode.split('::')
    return NodeEmoji.emoji[code] + NodeEmoji.emoji[skinTone]
  }
  return NodeEmoji.emoji[shortcode] || skinToneShortcodeToEmojiMap[shortcode]
}

const mapReactions = (
  slackReactions: { name: string, users: string[], count: number }[],
  customEmojis: Record<string, string>,
): MessageReaction[] => {
  if (!slackReactions?.length) return []
  const reactions = slackReactions?.flatMap(reaction => reaction.users.map(user => ({ ...reaction, user })))
  return reactions.map(reaction => {
    // reaction.name is `heart`, `+1`, or `+1::skin-tone-4`
    const emoji = shortcodeToEmoji(reaction.name)
    const reactionKey = emoji || reaction.name
    return {
      id: `${reaction.user}${reactionKey}`,
      participantID: reaction.user,
      reactionKey,
      imgURL: emoji ? undefined : mapReactionKey(reaction.name, customEmojis),
      emoji: !!emoji,
    }
  })
}

const mapAttachmentsText = (attachments: any[]): string => {
  if (!attachments?.length) return ''

  return attachments
    .map(x => {
      const text = x.text ? `${x.text}` : ''
      const title = x.title ? `${x.title}${text ? '\n\n' : ''}` : ''
      const pretext = x.pretext ? `${x.pretext}\n` : ''

      return `${title}${pretext}${text}` || x.fallback
    })
    .filter(Boolean)
    .join('\n')
}

const mapTweetAttachment = ({
  author_name,
  author_icon,
  author_subname,
  from_url,
  text: src,
  ts,
  image_url,
  image_width,
  image_height,
}: any): Tweet => {
  const { text, textAttributes } = mapTextAttributes(src)
  const tweet: Tweet = {
    id: from_url,
    user: {
      imgURL: author_icon,
      name: author_name,
      username: author_subname.slice(1),
    },
    timestamp: new Date(ts * 1000),
    url: from_url,
    text,
    textAttributes,
  }
  if (image_url) {
    tweet.attachments = [
      { id: image_url,
        type: MessageAttachmentType.IMG,
        srcURL: image_url,
        size: {
          width: image_width,
          height: image_height,
        },
      },
    ]
  }
  return tweet
}

const ACTION_MESSAGE_TYPES = new Set([
  'joiner_notification_for_inviter',
])

const mapLinkAttachment = ({
  title,
  title_link,
  text,
  image_url,
  image_width,
  image_height,
  service_icon,
  original_url,
}: any): MessageLink => ({
  url: title_link,
  originalURL: original_url,
  favicon: service_icon,
  img: image_url,
  imgSize: {
    width: image_width,
    height: image_height,
  },
  title,
  summary: text,
})

export const mapMessage = (
  slackMessage: CHRMessage,
  accountID: string,
  threadID: string,
  currentUserId: string,
  customEmojis: Record<string, string>,
  disableReplyButton = false,
): Message => {
  const senderID = slackMessage.user || slackMessage.bot_id || 'none'
  const tweetAttachments = []
  const linkAttachments = []
  const otherAttachments = []

  for (const x of slackMessage.attachments || []) {
    if (x.service_name === 'twitter') {
      tweetAttachments.push(x)
    } else if (x.title_link) {
      linkAttachments.push(x)
    } else {
      otherAttachments.push(x)
    }
  }

  const attachmentsText = mapAttachmentsText(otherAttachments)
  const text = slackMessage.text + attachmentsText

  const attachments = [
    ...(mapAttachments(slackMessage.files) || []),
    ...(mapAttachments(slackMessage.attachments) || []),
  ].filter(Boolean)

  let mappedText
  let textAttributes

  if (slackMessage.blocks) {
    // @ts-expect-error
    const data = mapBlocks(slackMessage.blocks, customEmojis)
    mappedText = data.text
    textAttributes = data.textAttributes
  } else if (text) {
    const data1 = mapTextAttributes(slackMessage.text, false)
    const data2 = mapTextAttributes(attachmentsText, true)
    mappedText = data1.text + data2.text
    textAttributes = {
      heDecode: true,
      entities: data1.textAttributes.entities.concat(
        offsetEntities(data2.textAttributes.entities, Array.from(data1.text).length),
      ),
    }
  }

  const buttons = []
  if (slackMessage.reply_count && !disableReplyButton) {
    buttons.push({
      label: `Show ${slackMessage.reply_count} ${slackMessage.reply_count === 1 ? 'reply' : 'replies'}`,
      linkURL: `texts://platform-callback/${accountID}/show-message-replies/${threadID}/${slackMessage.ts}/${slackMessage.latest_reply}/${truncate(mappedText, { length: 128 })}`,
    })
  }
  const action = mapAction(slackMessage)
  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage.ts,
    text: mappedText,
    timestamp: new Date(+slackMessage.ts * 1000),
    attachments,
    editedTimestamp: slackMessage.edited?.ts ? new Date(Number(slackMessage.edited?.ts) * 1000) : undefined,
    reactions: mapReactions(slackMessage.reactions as any, customEmojis) || [],
    senderID,
    isSender: currentUserId === senderID,
    textAttributes,
    buttons,
    isAction: !!action || ACTION_MESSAGE_TYPES.has(slackMessage.subtype),
    action,
    tweets: tweetAttachments.map(mapTweetAttachment),
    links: linkAttachments.map(mapLinkAttachment),
  }
}

export const mapParticipant = ({ profile }: any): Participant => profile && {
  id: profile.api_app_id || profile.id,
  username: profile.display_name || profile.real_name || profile.name,
  fullName: profile.real_name || profile.display_name,
  imgURL: profile.image_192 || profile.image_72,
  email: profile.email,
}

export const mapCurrentUser = ({ user, team, auth }: any): CurrentUser => ({
  id: auth.user_id,
  fullName: user.real_name,
  displayText: `${team?.name + ' - '}${user.display_name || user.real_name}`,
  imgURL: user.image_192,
})

export const mapProfile = (user: any): Participant => ({
  id: user.id,
  username: user?.profile?.name || user.name,
  fullName: user?.profile?.real_name || user?.profile?.display_name || user.name,
  imgURL: user?.profile?.image_192 || '',
})

const mapThread = (channel: any, accountID: string, currentUserId: string, customEmojis: Record<string, string>): Thread => {
  const messages = (channel.messages as any[])?.map(message => mapMessage(message, accountID, channel.id, currentUserId, customEmojis)) || []
  const participants = (channel.participants as any[])?.map(mapParticipant).filter(Boolean) || []

  const getType = () => {
    if (channel.is_group) return 'group'
    if (channel.is_channel) return 'channel'
    return 'single'
  }

  return {
    _original: JSON.stringify(channel),
    id: channel.id,
    type: getType(),
    title: channel.name || participants[0]?.username || channel.user,
    timestamp: messages[0]?.timestamp || channel.timestamp,
    isUnread: channel.unread || false,
    isReadOnly: channel.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
  }
}

export const mapThreads = (slackChannels: any[], accountID: string, currentUserId: string, customEmojis: Record<string, string>) =>
  slackChannels.map(thread => mapThread(thread, accountID, currentUserId, customEmojis))

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
