// eslint-disable-next-line import/no-extraneous-dependencies
import { CurrentUser, Message, MessageAttachment, MessageAttachmentType, Participant, Thread } from '@textshq/platform-sdk'

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

const mapBlock = (slackBlock: any) => {
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

const mapBlocks = (slackBlocks: any[]) => {
  const attachments = slackBlocks?.map(mapBlock).filter(x => Boolean(x))

  return {
    attachments,
  }
}

export const mapMessage = (slackMessage: any, currentUserId: string): Message => {
  const date = new Date(0)
  date.setUTCSeconds(Number(slackMessage?.ts))

  const senderID = slackMessage?.user || slackMessage?.bot_id

  const attachments = [
    ...(mapAttachments(slackMessage?.files) || []),
    ...(mapBlocks(slackMessage?.blocks).attachments || []),
  ]

  const text = slackMessage?.text
    || slackMessage?.attachments?.map(attachment => attachment.title).join(' ')
    || ''

  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage?.ts,
    timestamp: date,
    text,
    isDeleted: false,
    attachments,
    links: [],
    reactions: [],
    senderID,
    isSender: currentUserId === senderID,
    seen: {},
  }
}

export const mapParticipant = ({ profile }: any): Participant => ({
  id: profile.id,
  username: profile?.display_name,
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
    type: 'single',
    title: participants[0].username || slackChannel?.user,
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
