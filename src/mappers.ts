import { truncate } from 'lodash'
import { CurrentUser, Message, MessageAction, MessageActionType, Attachment, AttachmentType, MessageButton, MessageLink, MessageReaction, Participant, ServerEvent, ServerEventType, TextAttributes, Thread, ThreadType, Tweet, Size } from '@textshq/platform-sdk'
import type { MessageElement as CHRMessage } from '@slack/web-api/dist/response/ConversationsHistoryResponse'

import { mapTextAttributes, skinToneShortcodeToEmojiMap, mapBlocks, offsetEntities } from './text-attributes'
import { getEmojiUrl, getNativeShortcodeFromBlock, getEmojiUnicode } from './lib/emoji'

const getAttachmentType = (mimeType: string): AttachmentType => {
  if (mimeType?.startsWith('image')) return AttachmentType.IMG
  if (mimeType?.startsWith('video')) return AttachmentType.VIDEO
  if (mimeType?.startsWith('audio')) return AttachmentType.AUDIO
  return AttachmentType.UNKNOWN
}

const mapAttachment = (slackAttachment: any): Attachment => {
  let mimeType = slackAttachment?.mimetype
  if (slackAttachment?.image_url) mimeType = 'image'

  if (!slackAttachment || !mimeType) return

  const type = getAttachmentType(mimeType)
  const url = slackAttachment.url_private
    ? 'asset://$accountID/proxy/' + Buffer.from(slackAttachment.url_private).toString('hex')
    : slackAttachment.image_url

  const size: Size = (() => {
    if (slackAttachment.original_h) return { width: slackAttachment.original_w, height: slackAttachment.original_h }
    if (slackAttachment.thumb_video_h) return { width: slackAttachment.thumb_video_w, height: slackAttachment.thumb_video_h }
  })()

  return {
    id: `${slackAttachment.id}`,
    fileName: slackAttachment.name || 'image',
    type,
    mimeType,
    srcURL: url,
    size,
  }
}

const mapAttachments = (slackAttachments: any[]): Attachment[] => {
  if (!slackAttachments?.length) return []
  return slackAttachments.map(mapAttachment)
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

const mapAction = (slackMessage: CHRMessage): MessageAction => {
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

export const mapReactionKey = (shortcode: string, customEmojis: Record<string, string>) =>
  customEmojis[shortcode] || getEmojiUrl(shortcode) || shortcode

/** takes a shortcode argument like `+1` or `+1::skin-tone-4` and returns '👍' or '👍🏽' */
export const shortcodeToEmoji = (shortcode: string) => {
  if (shortcode.includes('::')) {
    const [code, skinTone] = shortcode.split('::')
    return getEmojiUnicode(code) + getEmojiUnicode(skinTone)
  }

  return getEmojiUnicode(shortcode) || skinToneShortcodeToEmojiMap[shortcode] || getNativeShortcodeFromBlock(shortcode)
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
    const isNativeEmoji = !!emoji && emoji !== reaction.name

    return {
      id: `${reaction.user}${reactionKey}`,
      participantID: reaction.user,
      reactionKey,
      imgURL: isNativeEmoji ? undefined : mapReactionKey(reaction.name, customEmojis),
      emoji: isNativeEmoji,
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
  if (!src) return
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
      {
        id: image_url,
        type: AttachmentType.IMG,
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

export const mapLinkAttachment = ({
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

  let mappedText: string
  let textAttributes: TextAttributes
  const buttons: MessageButton[] = []

  if (slackMessage.blocks) {
    const data = mapBlocks(slackMessage.blocks, customEmojis, text)
    mappedText = data.text
    textAttributes = data.textAttributes
    buttons.push(...data.buttons)
  } else if (text) {
    const data1 = mapTextAttributes(slackMessage.text, false, customEmojis)
    const data2 = mapTextAttributes(attachmentsText, true, customEmojis)
    mappedText = data1.text + data2.text
    textAttributes = {
      heDecode: true,
      entities: data1.textAttributes.entities.concat(
        offsetEntities(data2.textAttributes.entities, Array.from(data1.text).length),
      ),
    }
  }

  const links = linkAttachments.map(mapLinkAttachment)
  const filteredSlackMessagesAttachments = (slackMessage.attachments || []).filter(
    // @notes
    //  Slack is sending OG images inside of the attachments array so we need to filter them
    //  by checking if the `from_url` field is not included in the links array.
    attachment => links.every(link => link.url !== attachment.from_url),
  )

  const attachments = [
    ...(mapAttachments(slackMessage.files) || []),
    ...(mapAttachments(filteredSlackMessagesAttachments) || []),
  ].filter(Boolean)

  const replyLink = `texts://platform-callback/${accountID}/show-message-replies/${threadID}/${slackMessage.ts}/${slackMessage.latest_reply}/${truncate(mappedText, { length: 128 })}`

  if (slackMessage.reply_count && !disableReplyButton) {
    buttons.push({
      label: `Show ${slackMessage.reply_count} ${slackMessage.reply_count === 1 ? 'reply' : 'replies'}`,
      linkURL: replyLink,
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
    buttons: buttons.length ? buttons : undefined,
    isAction: !!action || ACTION_MESSAGE_TYPES.has(slackMessage.subtype),
    action,
    tweets: tweetAttachments.map(mapTweetAttachment).filter(Boolean),
    links,
    extra: {
      actions: [{
        label: 'Reply in thread',
        linkURL: replyLink,
      } satisfies MessageButton],
    },
  }
}

export const mapAppOrBot = ({ profile }: {
  profile: {
    name: string
    display_name: string
    real_name: string
    id: string
    icons: Record<string, string>
  }
}): Participant => profile && {
  id: profile.id,
  username: profile.name || profile.display_name,
  fullName: profile.name || profile.display_name,
  imgURL: profile.icons?.image_72 || profile.icons?.image_48 || profile.icons?.image_32,
}

export const mapParticipant = ({ profile }: any): Participant => {
  if (!profile) return
  if (profile.app_id) return mapAppOrBot({ profile })

  return {
    id: profile.user_id || profile.id || profile.bot_id || profile.api_app_id,
    username: profile.display_name || profile.real_name || profile.name,
    fullName: profile.real_name || profile.display_name,
    imgURL: profile.image_192 || profile.image_72,
    email: profile.email,
  }
}

export const mapCurrentUser = ({ user, team, auth }: any): CurrentUser => ({
  id: auth.enterprise_id ? `${auth.enterprise_id}-${team.id}-${auth.user_id}` : auth.user_id,
  fullName: user.real_name,
  displayText: `${team?.name} - ${user.display_name || user.real_name}`,
  imgURL: user.image_192,
})

export const mapProfile = (user: any): Participant => ({
  id: user.id,
  username: user?.profile?.name || user.name,
  fullName: user?.profile?.real_name || user?.profile?.display_name || user.name,
  imgURL: user?.profile?.image_192 || '',
})

const mapThread = (
  channel: any,
  accountID: string,
  currentUserId: string,
  customEmojis: Record<string, string>,
  mutedChannels: Set<string> = new Set(),
  teamName = '',
): Thread => {
  const messages = (channel.messages as any[])?.map(message => mapMessage(message, accountID, channel.id, currentUserId, customEmojis)) || []
  const participants = (channel.participants as any[])?.map(mapParticipant).filter(participant => participant?.id) || []

  const type = ((): ThreadType => {
    if (channel.is_group || channel.is_mpim) return 'group'
    if (channel.is_channel) return 'channel'
    return 'single'
  })()

  const title = ((): string => {
    if (type === 'channel') return `${teamName ? `${teamName} - ` : ''}#${channel.name}`
    if (type === 'group' && participants.length > 0) return undefined
    if (type === 'group' && channel.members?.length > 0 && (channel.name as string).startsWith('mpdm-') && channel.purpose?.value) {
      return channel.purpose.value.split(': ').pop()
    }
    return channel.name
  })()

  const isMuted = mutedChannels.has(channel.id)

  return {
    _original: JSON.stringify(channel),
    id: channel.id,
    type,
    title,
    mutedUntil: isMuted ? 'forever' : undefined,
    timestamp: messages[0]?.timestamp || channel.timestamp || new Date(channel.updated),
    isUnread: channel.unread || false,
    isReadOnly: channel.is_user_deleted || false,
    messages: { items: messages, hasMore: true },
    participants: { items: participants, hasMore: false },
  }
}

export const mapThreads = (
  slackChannels: any[],
  accountID: string,
  currentUserId: string,
  customEmojis: Record<string, string>,
  mutedChannels: Set<string>,
  teamName = '',
) => slackChannels.map(thread => mapThread(thread, accountID, currentUserId, customEmojis, mutedChannels, teamName))

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

    default:
      return []
  }
}
