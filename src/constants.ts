export const BOLD_REGEX = /\*[^\s]([+A-Za-z0-9_ ]+[^\s])\*/g
export const MENTION_REGEX = /<@([A-Za-z0-9_]+)>/g
export const SLACK_THREAD_REGEX = /<#([A-Za-z0-9_]+)\|([A-Za-z0-9_]+)>/g
export const LINK_REGEX = /<((https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,}))(\|[a-zA-Z0-9\- ]+)?>/g

export const MESSAGE_REPLY_THREAD_PREFIX = 'mr/'
