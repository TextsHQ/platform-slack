import { CurrentUser, Message, MessageAction, MessageActionType, MessageAttachment, MessageAttachmentType, MessageButton, MessageReaction, Participant, TextAttributes, TextEntity, Thread } from '@textshq/platform-sdk'
import { EMOTE_REGEX, LINK_REGEX, SLACK_THREAD_REGEX } from './constants'
import { EMOTES } from './emotes'
import { removeCharactersAfterAndBefore } from './util'

const mapAttachment = (slackAttachment: any): MessageAttachment => {
  const type = (() => {
    if (slackAttachment?.mimetype?.startsWith('image')) return MessageAttachmentType.IMG
    if (slackAttachment?.mimetype?.startsWith('video')) return MessageAttachmentType.VIDEO
    if (slackAttachment?.mimetype?.startsWith('audio')) return MessageAttachmentType.AUDIO
    return MessageAttachmentType.UNKNOWN
  })()

  return {
    id: slackAttachment?.id,
    fileName: slackAttachment?.name,
    type,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(slackAttachment?.url_private).toString('hex'),
    mimeType: slackAttachment?.mimetype,
  }
}

const mapAttachments = (slackAttachments: any[]): MessageAttachment[] => {
  if (!slackAttachments) return []
  return slackAttachments.map(mapAttachment)
}

const mapAttachmentBlock = (slackBlock: any) => {
  const { type: slackType } = slackBlock
  if (slackType !== 'image') return

  const type = (() => {
    if (slackType?.startsWith('image')) return MessageAttachmentType.IMG
    if (slackType?.startsWith('video')) return MessageAttachmentType.VIDEO
    if (slackType?.startsWith('audio')) return MessageAttachmentType.AUDIO
    return MessageAttachmentType.UNKNOWN
  })()

  return {
    id: slackBlock.image_url,
    type,
    srcURL: 'asset://$accountID/proxy/' + Buffer.from(slackBlock.image_url).toString('hex'),
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
  const richElements = richTexts?.flatMap(extractElements).flatMap(extractElements).filter(x => Boolean(x)) || []
  const sectionElements = sectionTexts?.map(({ text }) => text) || []

  return [...richElements, ...sectionElements, ...calls]
}

const mapBlocks = (slackBlocks: any[], text = '', emojis = []) => {
  const attachments = slackBlocks?.map(mapAttachmentBlock).filter(x => Boolean(x))
  const richElements = extractRichElements(slackBlocks)

  const entities: TextEntity[] = []
  let mappedText = text
  const buttons: MessageButton[] = []

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

      const from = mappedText.indexOf(username)
      entities.push({ from, to: from + username.length, mentionedUser: { id: blockUser, username } })
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
            width: mappedText.length === blockEmojiName.length ? 64 : 16,
            height: mappedText.length === blockEmojiName.length ? 64 : 16,
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

  return {
    attachments,
    textAttributes: { entities },
    mappedText,
    buttons,
  }
}

export const mapAction = (slackMessage: any): MessageAction => {
  if (slackMessage?.subtype !== 'channel_join') return

  return {
    type: MessageActionType.THREAD_PARTICIPANTS_ADDED,
    participantIDs: [slackMessage?.user],
    actorParticipantID: slackMessage?.user,
  }
}

const mapNativeEmojis = (text: string): string => {
  if (!text) return

  const found = text?.match(EMOTE_REGEX)
  if (!found) return text

  let mappedText = text
  for (const emote of found) {
    const emoteUnicode = EMOTES.find(({ emoji }) => emoji === emote)
    if (emoteUnicode) mappedText = mappedText.replace(emote, emoteUnicode.unicode)
  }

  return mappedText
}

const mapTextWithLinkEntities = (slackText: string): TextAttributes => {
  const found = slackText?.match(LINK_REGEX)
  if (!found) return {}

  const entities: TextEntity[] = []
  let finalText = slackText

  for (const linkFound of found) {
    const linkAndText = linkFound.slice(1, linkFound.length - 1)
    finalText = removeCharactersAfterAndBefore(finalText, linkAndText)

    const text = linkAndText.includes('|') ? linkAndText.split('|').pop() : ''
    const link = linkAndText.includes('|') ? linkAndText.split('|')[0] : linkAndText

    if (text) finalText = finalText.replace(`${link}|`, '')

    const from = text ? finalText.indexOf(text) : finalText.indexOf(link)
    const to = from + (text ? text.length : link.length)
    entities.push({ from, to, link })
  }

  return { entities }
}

const replaceLinks = (slackText: string): string => {
  const found = [...(slackText?.match(LINK_REGEX) || []), ...(slackText?.match(SLACK_THREAD_REGEX) || [])]
  if (!found?.length) return slackText
  let finalText = slackText

  for (const linkFound of found) {
    const linkAndText = linkFound.slice(1, linkFound.length - 1)
    finalText = removeCharactersAfterAndBefore(finalText, linkAndText)

    const text = linkAndText.includes('|') ? linkAndText.split('|').pop() : ''
    const link = linkAndText.includes('|') ? linkAndText.split('|')[0] : linkAndText

    if (text) finalText = finalText.replace(`${link}|`, link.includes('#') ? '#' : '')
  }

  return finalText
}

const mapReactions = (
  slackReactions: { name: string; users: string[]; count: number }[],
  messageId: string,
  emojis: any[],
): MessageReaction[] => {
  if (!slackReactions?.length) return []

  const reactions = slackReactions?.flatMap(reaction => reaction.users.map(user => ({ ...reaction, user })))
  return reactions.map(reaction => ({
    id: `${messageId}-${reaction.name}-${reaction.user}`,
    participantID: reaction.user,
    reactionKey: emojis[reaction.name] || EMOTES.find(({ emoji }) => emoji === `:${reaction.name}:`)?.unicode || reaction.name,
    emoji: Boolean(emojis[reaction.name]),
  }))
}

export const mapMessage = (slackMessage: any, currentUserId: string, emojis: any[] = []): Message => {
  const date = new Date(Number(slackMessage?.ts) * 1000)
  const senderID = slackMessage?.user || slackMessage?.bot_id || 'none'

  const text = mapNativeEmojis(slackMessage?.text)
    || mapNativeEmojis(slackMessage?.attachments?.map(attachment => attachment.title).join(' '))
    || ''
  // This is done because bot messages have 'This content can't be displayed' as text field. So doing this
  // we avoid to concatenate that to the real message (divided in sections).
  const blocksText = slackMessage?.subtype !== 'bot_message' ? text : ''
  const blocks = mapBlocks(slackMessage?.blocks, blocksText, emojis)

  const attachments = [
    ...(mapAttachments(slackMessage?.files) || []),
    ...(blocks.attachments || []),
  ]

  const mappedText = replaceLinks(mapNativeEmojis(blocks.mappedText) || text)
  const textAttributes: TextAttributes = { entities: [
    ...(blocks.textAttributes.entities || []),
    ...(mapTextWithLinkEntities(mapNativeEmojis(blocks.mappedText) || text).entities || []),
  ] }

  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage?.ts,
    text: mappedText,
    timestamp: date,
    isDeleted: false,
    attachments,
    links: [],
    reactions: mapReactions(slackMessage.reactions, slackMessage?.ts, emojis) || [],
    senderID: slackMessage?.thread_ts ? '$thread' : senderID,
    isSender: currentUserId === senderID,
    seen: {},
    textAttributes: textAttributes || undefined,
    buttons: blocks.buttons || undefined,
    isAction: Boolean(mapAction(slackMessage)),
    action: mapAction(slackMessage) || undefined,
    linkedMessageID: !slackMessage?.reply_count ? (slackMessage?.thread_ts || undefined) : undefined,
  }
}

export const mapParticipant = ({ profile }: any): Participant => ({
  id: profile.id,
  username: profile?.display_name || profile?.real_name,
  fullName: profile?.real_name || profile?.display_name,
  imgURL: profile.image_192 || undefined,
})

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

const mapThread = (slackChannel: any, currentUserId: string): Thread => {
  const messages: Message[] = slackChannel?.messages?.map(message => mapMessage(message, currentUserId)) || []
  const participants: Participant[] = slackChannel.participants.map(mapParticipant) || []

  return {
    _original: JSON.stringify(slackChannel),
    id: slackChannel.id,
    type: slackChannel.is_group || slackChannel.is_channel ? 'group' : 'single',
    title: slackChannel?.name || participants[0].username || slackChannel?.user,
    // FIXME: Slack doesn't have the last activity date. So if the thread doesn't have the first message,
    // it'll set 1970 as the timestamp.
    timestamp: messages[0]?.timestamp || slackChannel?.timestamp || new Date(0),
    isUnread: slackChannel?.unread || false,
    isReadOnly: slackChannel?.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
    isArchived: undefined,
  }
}

export const mapThreads = (slackChannels: any[], currentUserId: string): Thread[] => slackChannels.map(thread => mapThread(thread, currentUserId))
