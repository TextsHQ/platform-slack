import { MessageDeletionMode, Attribute, PlatformInfo } from '@textshq/platform-sdk'

const icon = `
  <svg viewBox="0 0 164 164" xmlns="http://www.w3.org/2000/svg">
    <rect width="164" height="164" rx="32" fill="#611f69"/>
    <g fill="none" transform="translate(18,18)">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A"/>
      <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0"/>
      <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D"/>
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/>
    </g>
  </svg>
`

const info: PlatformInfo = {
  name: 'slack',
  version: '0.0.1',
  displayName: 'Slack',
  icon,
  tags: ['Beta'],
  typingDurationMs: 3000,
  deletionMode: MessageDeletionMode.DELETE_FOR_EVERYONE,
  loginMode: 'browser',
  browserLogin: {
    loginURL: 'https://slack.com/signin#/signin',
    authCookieName: 'd',
  },
  reactions: {
    supported: {},
    canReactWithAllEmojis: true,
    allowsMultipleReactionsToSingleMessage: true,
  },
  attributes: new Set([
    Attribute.SUPPORTS_DELETE_THREAD,
    Attribute.SORT_MESSAGES_ON_PUSH,
    Attribute.CAN_MESSAGE_USERNAME,
  ]),
}

export default info
