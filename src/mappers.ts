// eslint-disable-next-line import/no-extraneous-dependencies
import { CurrentUser, Message, MessageAction, MessageActionType, MessageAttachment, MessageAttachmentType, Participant, TextEntity, Thread } from '@textshq/platform-sdk'
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
  const richTexts = slackBlocks?.filter(({ type }) => type === 'rich_text') || []
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

  return richElements
}

const mapBlocks = (slackBlocks: any[], text = '') => {
  const attachments = slackBlocks?.map(mapAttachmentBlock).filter(x => Boolean(x))
  const richElements = extractRichElements(slackBlocks)

  const entities: TextEntity[] = []
  let mappedText = text

  for (const element of richElements) {
    const { type = '', style, text: blockText, url: blockUrl, user_id: blockUser, profile: blockProfile } = element

    if (type === 'text' && style && blockText) {
      mappedText = removeCharactersAfterAndBefore(mappedText, blockText)
      const from = mappedText.indexOf(blockText)
      entities.push({ from, to: from + blockText.length, ...style })
    }

    if (type === 'link' && blockUrl) {
      mappedText = removeCharactersAfterAndBefore(mappedText, blockUrl)
      const from = mappedText.indexOf(blockUrl)
      entities.push({ from, to: from + blockUrl.length, link: blockUrl })
    }

    if (type === 'user' && blockUser) {
      const username = blockProfile?.display_name || blockUser

      mappedText = mappedText.replace(blockUser, username)
      mappedText = removeCharactersAfterAndBefore(mappedText, `@${username}`)
      const from = mappedText.indexOf(username)
      entities.push({ from, to: from + username.length, mentionedUser: { id: blockUser, username } })
    }
  }

  return {
    attachments,
    textAttributes: { entities },
    mappedText,
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

export const mapMessage = (slackMessage: any, currentUserId: string): Message => {
  const date = new Date(Number(slackMessage?.ts) * 1000)
  const senderID = slackMessage?.user || slackMessage?.bot_id

  const text = slackMessage?.text
    || slackMessage?.attachments?.map(attachment => attachment.title).join(' ')
    || ''

  const blocks = mapBlocks(slackMessage?.blocks, text)

  const attachments = [
    ...(mapAttachments(slackMessage?.files) || []),
    ...(blocks.attachments || []),
  ]

  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage?.ts,
    text: blocks.mappedText || text,
    timestamp: date,
    isDeleted: false,
    attachments,
    links: [],
    reactions: [],
    senderID,
    isSender: currentUserId === senderID,
    seen: {},
    textAttributes: blocks.textAttributes || undefined,
    isAction: Boolean(mapAction(slackMessage)),
    action: mapAction(slackMessage) || undefined,
  }
}

export const mapParticipant = ({ profile }: any): Participant => ({
  id: profile.id,
  username: profile?.display_name || profile?.real_name,
  fullName: profile?.real_name || profile?.display_name,
  imgURL: profile.image_192 || undefined,
})

export const mapCurrentUser = ({ profile }: any): CurrentUser => ({
  id: profile.id,
  fullName: profile.real_name,
  displayText: profile.display_name,
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
    type: participants?.length > 2 ? 'group' : 'single',
    title: slackChannel?.name || participants[0].username || slackChannel?.user,
    // FIXME: Slack doesn't have the last activity date. So if the thread doesn't have the first message,
    // it'll set 1970 as the timestamp.
    timestamp: messages[0]?.timestamp || new Date(0),
    isUnread: slackChannel?.unread || false,
    isReadOnly: slackChannel?.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
    isArchived: undefined,
  }
}

export const mapThreads = (slackChannels: any[], currentUserId: string): Thread[] => slackChannels.map(thread => mapThread(thread, currentUserId))
