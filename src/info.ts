import { MessageDeletionMode, Attribute, PlatformInfo } from '@textshq/platform-sdk'

const icon = `
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="16" height="16" rx="5" fill="#611F69"/>
    <path d="M4.58538 9.74633C4.58538 10.4585 4.00977 11.0341 3.29757 11.0341C2.58538 11.0341 2.00977 10.4585 2.00977 9.74633C2.00977 9.03414 2.58538 8.45853 3.29757 8.45853H4.58538V9.74633ZM5.22928 9.74633C5.22928 9.03414 5.80489 8.45853 6.51709 8.45853C7.22928 8.45853 7.80489 9.03414 7.80489 9.74633V12.9658C7.80489 13.678 7.22928 14.2537 6.51709 14.2537C5.80489 14.2537 5.22928 13.678 5.22928 12.9658V9.74633Z" fill="#E01E5A"/>
    <path d="M6.51708 4.57561C5.80488 4.57561 5.22927 4 5.22927 3.2878C5.22927 2.57561 5.80488 2 6.51708 2C7.22927 2 7.80488 2.57561 7.80488 3.2878V4.57561H6.51708ZM6.51708 5.22927C7.22927 5.22927 7.80488 5.80488 7.80488 6.51707C7.80488 7.22927 7.22927 7.80488 6.51708 7.80488H3.28781C2.57561 7.80488 2 7.22927 2 6.51707C2 5.80488 2.57561 5.22927 3.28781 5.22927H6.51708Z" fill="#36C5F0"/>
    <path d="M11.6781 6.51707C11.6781 5.80488 12.2537 5.22927 12.9659 5.22927C13.6781 5.22927 14.2537 5.80488 14.2537 6.51707C14.2537 7.22927 13.6781 7.80488 12.9659 7.80488H11.6781V6.51707ZM11.0342 6.51707C11.0342 7.22927 10.4585 7.80488 9.74635 7.80488C9.03415 7.80488 8.45854 7.22927 8.45854 6.51707V3.2878C8.45854 2.57561 9.03415 2 9.74635 2C10.4585 2 11.0342 2.57561 11.0342 3.2878V6.51707Z" fill="#2EB67D"/>
    <path d="M9.74635 11.678C10.4585 11.678 11.0342 12.2537 11.0342 12.9658C11.0342 13.678 10.4585 14.2537 9.74635 14.2537C9.03415 14.2537 8.45854 13.678 8.45854 12.9658V11.678H9.74635ZM9.74635 11.0341C9.03415 11.0341 8.45854 10.4585 8.45854 9.74633C8.45854 9.03414 9.03415 8.45853 9.74635 8.45853H12.9756C13.6878 8.45853 14.2634 9.03414 14.2634 9.74633C14.2634 10.4585 13.6878 11.0341 12.9756 11.0341H9.74635Z" fill="#ECB22E"/>
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
    runJSOnClose: 'magicLink',
    runJSOnLaunch: `
      let magicLink = "";

      const handleButtonClick = (href) => {
        magicLink = href;
        setTimeout(() => window.close(), 1000);
      }

      window.addEventListener('hashchange', function(){
        const url = window.location.href

        if (url.includes('signin')) {
          const elements = document.querySelectorAll('[href*="login"]')

          elements.forEach((element) => {
            element.target = '';

            const { href } = element;
            if (href.includes('login')) {
              element.onclick = () => handleButtonClick(href);
              element.removeAttribute('href');
            }

            // TODO: Implement for 2-fa
          })
        }
      });
    `,
  },
  reactions: {
    supported: {},
    canReactWithAllEmojis: true,
    allowsMultipleReactionsToSingleMessage: true,
  },
  attributes: new Set([
    Attribute.SORT_MESSAGES_ON_PUSH,
    Attribute.CAN_MESSAGE_USERNAME,
    Attribute.SUPPORTS_DELETE_THREAD,
    Attribute.SUPPORTS_EDIT_MESSAGE,
    Attribute.SUPPORTS_PRESENCE,
    Attribute.SUPPORTS_CUSTOM_EMOJIS,
    Attribute.SEARCH_ALL_USERS_FOR_GROUP_MENTIONS,
  ]),
  prefs: {
    show_channels: {
      label: 'Show channels',
      type: 'checkbox',
      default: false,
    },
  },
}

export default info
