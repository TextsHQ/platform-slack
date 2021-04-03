import type { CurrentUser, Message, Participant, Thread } from '@textshq/platform-sdk'

export const mapMessage = (slackMessage: any, currentUserId: string): Message => {
  const date = new Date(0)
  date.setUTCSeconds(Number(slackMessage.ts))

  const senderID = slackMessage.user || slackMessage.bot_id

  return {
    _original: JSON.stringify(slackMessage),
    id: slackMessage.ts,
    cursor: slackMessage.ts,
    timestamp: date,
    text: slackMessage.text,
    isDeleted: false,
    attachments: [],
    links: [],
    reactions: [],
    senderID,
    isSender: currentUserId === senderID,
    seen: {},
  }
}

const mapParticipant = ({ profile }: any): Participant => ({
  id: profile.id,
  username: profile?.display_name,
  fullName: profile?.real_name || profile?.display_name,
  imgURL: profile.image_192,
})

export const mapCurrentUser = ({ profile }: any): CurrentUser => ({
  id: profile.id,
  fullName: profile.real_name,
  displayText: profile.display_name,
  imgURL: profile.image_192,
})

const mapThread = (slackChannel: any, currentUserId: string): Thread => {
  const messages: Message[] = slackChannel.messages.messages.map(message => mapMessage(message, currentUserId)) || []
  const participants: Participant[] = slackChannel.participants.map(mapParticipant) || []

  return {
    _original: JSON.stringify(slackChannel),
    id: slackChannel.id,
    type: 'single',
    title: participants[0].username || slackChannel?.user,
    timestamp: messages[0]?.timestamp || new Date(),
    isUnread: false,
    isReadOnly: slackChannel?.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
    isArchived: undefined,
  }
}

export const mapThreads = (slackChannels: any[], currentUserId: string): Thread[] => slackChannels.map(thread => mapThread(thread, currentUserId))
