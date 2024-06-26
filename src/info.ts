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
  brand: {
    background: '#611F69',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 48 48">
    <path fill="black" d="M13.756 29.239a3.86 3.86 0 0 1-3.863 3.863 3.86 3.86 0 0 1-3.864-3.863 3.86 3.86 0 0 1 3.864-3.864h3.863v3.864Zm1.932 0a3.86 3.86 0 0 1 3.863-3.864 3.86 3.86 0 0 1 3.864 3.864v9.658a3.86 3.86 0 0 1-3.864 3.864 3.86 3.86 0 0 1-3.863-3.864V29.24Zm3.863-15.512a3.86 3.86 0 0 1-3.863-3.864A3.86 3.86 0 0 1 19.55 6a3.86 3.86 0 0 1 3.864 3.863v3.864H19.55Zm0 1.96a3.86 3.86 0 0 1 3.864 3.864 3.86 3.86 0 0 1-3.864 3.864H9.863A3.86 3.86 0 0 1 6 19.55a3.86 3.86 0 0 1 3.863-3.863h9.688Zm15.483 3.864a3.86 3.86 0 0 1 3.864-3.863 3.86 3.86 0 0 1 3.863 3.863 3.86 3.86 0 0 1-3.863 3.864h-3.864V19.55Zm-1.931 0a3.86 3.86 0 0 1-3.864 3.864 3.86 3.86 0 0 1-3.864-3.864V9.863A3.86 3.86 0 0 1 29.24 6a3.86 3.86 0 0 1 3.863 3.863v9.688Zm-3.864 15.483a3.86 3.86 0 0 1 3.863 3.863 3.86 3.86 0 0 1-3.863 3.864 3.86 3.86 0 0 1-3.864-3.864v-3.863h3.864Zm0-1.932a3.86 3.86 0 0 1-3.864-3.863 3.86 3.86 0 0 1 3.864-3.864h9.688a3.86 3.86 0 0 1 3.863 3.864 3.86 3.86 0 0 1-3.863 3.863h-9.688Z"/>
  </svg>`,
    coloredIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 48 48">
    <path fill="#E01E5A" d="M13.756 29.239a3.86 3.86 0 0 1-3.863 3.863 3.86 3.86 0 0 1-3.864-3.863 3.86 3.86 0 0 1 3.864-3.864h3.863v3.864Zm1.932 0a3.86 3.86 0 0 1 3.863-3.864 3.86 3.86 0 0 1 3.864 3.864v9.658a3.86 3.86 0 0 1-3.864 3.864 3.86 3.86 0 0 1-3.863-3.864V29.24Z"/>
    <path fill="#36C5F0" d="M19.551 13.727a3.86 3.86 0 0 1-3.863-3.864A3.86 3.86 0 0 1 19.55 6a3.86 3.86 0 0 1 3.864 3.863v3.864H19.55Zm0 1.96a3.86 3.86 0 0 1 3.864 3.864 3.86 3.86 0 0 1-3.864 3.864H9.863A3.86 3.86 0 0 1 6 19.55a3.86 3.86 0 0 1 3.863-3.863h9.688Z"/>
    <path fill="#2EB67D" d="M35.034 19.551a3.86 3.86 0 0 1 3.864-3.863 3.86 3.86 0 0 1 3.863 3.863 3.86 3.86 0 0 1-3.863 3.864h-3.864V19.55Zm-1.931 0a3.86 3.86 0 0 1-3.864 3.864 3.86 3.86 0 0 1-3.864-3.864V9.863A3.86 3.86 0 0 1 29.24 6a3.86 3.86 0 0 1 3.863 3.863v9.688Z"/>
    <path fill="#ECB22E" d="M29.239 35.034a3.86 3.86 0 0 1 3.863 3.863 3.86 3.86 0 0 1-3.863 3.864 3.86 3.86 0 0 1-3.864-3.864v-3.863h3.864Zm0-1.932a3.86 3.86 0 0 1-3.864-3.863 3.86 3.86 0 0 1 3.864-3.864h9.688a3.86 3.86 0 0 1 3.863 3.864 3.86 3.86 0 0 1-3.863 3.863h-9.688Z"/>
  </svg>`,
  },
  typingDurationMs: 3000,
  deletionMode: MessageDeletionMode.DELETE_FOR_EVERYONE,
  loginMode: ['browser', 'browser-extension'],
  browserLogin: {
    // url: 'https://slack.com/' and then user hitting "sign in" manually fails at getFirstTeamURL
    url: 'https://slack.com/signin',
    authCookieName: 'd',
    closeOnRedirectRegex: 'ssb/redirect',
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    runJSOnNavigate: `
      window.__loginReturnValue = window.__loginReturnValue || {}
      window.__changeListener = window.__changeListener || function () {
        const url = window.location.href
        const form = document.getElementById('signin_form')
        if (form) {
          const submitButton = document.getElementById('signin_btn')
          submitButton.type = 'reset'
          submitButton.onclick = async () => {
            submitButton.classList.toggle('c-button--disabled')
            const res = await fetch('/', {
              "method": "POST",
              "mode": "cors",
              "credentials": "include",
              "referrerPolicy": "no-referrer",
              headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                "cache-control": "max-age=0",
                "content-type": "application/x-www-form-urlencoded",
                "sec-ch-ua": '" Not A;Brand";v="99", "Chromium";v="112"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1"
              },
              body: new URLSearchParams(new FormData(form)).toString()
            })

            if (res.status === 302) {
              window.__loginReturnValue.method = 'password'
              setTimeout(() => window.close(), 1000)
            }

            submitButton.classList.toggle('c-button--disabled')
          }
        }
      }

      window.__addedListener = false
      window.__addNavigationListener = window.__addNavigationListener || function () {
        if (window.__addedListener) return
        window.addEventListener('hashchange', window.__changeListener)
        window.__addedListener = true
      }

      window.__overrideWorkspaceLink = window.__overrideWorkspaceLink || function () {
        const url = window.location.href
        if (!url.includes('signin.findWorkspaces') && !url.includes('signin#/workspaces')) return

        const elements = document.querySelectorAll('.p-workspaces_list__link')
        elements.forEach((element) => {
          // Do not open links in a new window
          element.target = ''
        })
      }

      window.__addEventsListeners = window.__addEventsListeners || function () {
        const observer = new MutationObserver(() => window.__overrideWorkspaceLink())
        const container = document.documentElement || document.body
        observer.observe(container, { childList: true, subtree: true })
      }

      window.__addNavigationListener()
      window.__changeListener()
      window.__addEventsListeners()
      window.__overrideWorkspaceLink()`,
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
    Attribute.SUPPORTS_MARK_AS_UNREAD,
    Attribute.SEARCH_ALL_USERS_FOR_GROUP_MENTIONS,
    Attribute.SUBSCRIBE_TO_THREAD_SELECTION,
    Attribute.SUBSCRIBE_TO_ONLINE_OFFLINE_ACTIVITY,
    Attribute.SUPPORTS_PUSH_NOTIFICATIONS,
    Attribute.CAN_FETCH_LINK_PREVIEW,
    Attribute.CAN_REMOVE_LINK_PREVIEW,
    Attribute.NO_SUPPORT_GROUP_TITLE_CHANGE,
  ]),
  attachments: {
    maxSize: {
      // https://slack.com/intl/en-us/help/articles/201330736-Add-files-to-Slack
      // "Note: Files added to Slack may not exceed 1 GB in size."
      image: 1 * 1024 * 1024 * 1024,
      video: 1 * 1024 * 1024 * 1024,
      audio: 1 * 1024 * 1024 * 1024,
      files: 1 * 1024 * 1024 * 1024,
    },
    gifMimeType: 'image/gif',
  },
  notifications: {
    android: {
      senderID: '508767403424',
    },
  },
  prefs: {
    show_channels: {
      label: 'Show channels',
      type: 'checkbox',
      description: 'Experimental. All Slack features may not be present.',
      default: false,
    },
  },
}

export default info
