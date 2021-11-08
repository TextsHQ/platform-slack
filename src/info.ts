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
    runJSOnClose: 'JSON.stringify(window.__loginReturnValue)',
    runJSOnNavigate: `
      window.__changeListener = window.__changeListener || function() {
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
                "sec-ch-ua": '"Chromium";v="94", "Google Chrome";v="94", ";Not A Brand";v="99"',
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
              window.__loginReturnValue = { method: 'password' }
              setTimeout(() => window.close(), 1000)
            }

            submitButton.classList.toggle('c-button--disabled')
          }
        }
      }
      
      window.__addedListener = false
      window.__addNavigationListener = window.__addNavigationListener || function() {
        if (window.__addedListener) return
        window.addEventListener('hashchange', window.__changeListener)
        window.__addedListener = true
      }
      window.__addNavigationListener()
      window.__changeListener()
    `,
    runJSOnLaunch: `
      window.__loginReturnValue = {};

      const handleButtonClick = (href) => {
        window.__loginReturnValue = { magicLink: href };
        setTimeout(() => window.close(), 1000)
      }

      // @see https://gist.github.com/benjamingr/0433b52559ad61f6746be786525e97e8
      function interceptNetworkRequests(ee) {
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;

        const isRegularXHR = open.toString().indexOf("native code") !== -1;
        // don't hijack if already hijacked - this will mess up with frameworks like Angular with zones
        // we work if we load first there which we can.
        if (isRegularXHR) {
          XMLHttpRequest.prototype.open = function () {
            ee.onOpen && ee.onOpen(this, arguments);
      
            if (ee.onLoad) this.addEventListener("load", ee.onLoad.bind(ee));
            if (ee.onError) this.addEventListener("error", ee.onError.bind(ee));
      
            return open.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function () {
            ee.onSend && ee.onSend(this, arguments);
            return send.apply(this, arguments);
          };
        }

        const fetch = window.fetch || "";
        // don't hijack twice, if fetch is built with XHR no need to decorate, if already hijacked
        // then this is dangerous and we opt out
        const isFetchNative = fetch.toString().indexOf("native code") !== -1;
        if (isFetchNative) {
          window.fetch = function () {
            ee.onFetch && ee.onFetch(arguments);
            const p = fetch.apply(this, arguments);
            p.then(ee.onFetchResponse, ee.onFetchError);
            return p;
          };
          // at the moment, we don't listen to streams which are likely video
          const json = Response.prototype.json;
          const text = Response.prototype.text;
          const blob = Response.prototype.blob;
          Response.prototype.json = function () {
            const p = json.apply(this.arguments);
            p.then(ee.onFetchLoad && ee.onFetchLoad.bind(ee, "json"));
            return p;
          };
          Response.prototype.text = function () {
            const p = text.apply(this.arguments);
            p.then(ee.onFetchLoad && ee.onFetchLoad.bind(ee, "text"));
            return p;
          };
          Response.prototype.blob = function () {
            const p = blob.apply(this.arguments);
            p.then(ee.onFetchLoad && ee.onFetchLoad.bind(ee, "blob"));
            return p;
          };
        }
        return ee;
      }

      const interceptedResponse = (value) => {      
        value.onload = function () {
          if (value.readyState == XMLHttpRequest.DONE) {
            // Example: https://slack.com/api/signin.findWorkspaces?_x_id=noversion-1636318402.702&slack_route=T00000000&_x_version_ts=no-version
            if (!value?.responseURL?.includes("api/signin.findWorkspaces")) return;
      
            const data = value?.response ? JSON.parse(value.response) : {};

            if (data?.current_teams?.length === 1) {
              const [currentTeam] = data?.current_teams;
              const [team] = currentTeam.teams;

              window.__loginReturnValue = { 
                magicLink: team.magic_login_url,
                domain: team.url,
              };

              window.close()
            }
          }
        };
      };

      interceptNetworkRequests({
        onFetch: interceptedResponse,
        onFetchResponse: interceptedResponse,
        onSend: interceptedResponse,
        onError: console.log,
      });

      const addEventsListeners = () => {
        window.addEventListener('hashchange', function(){
          const url = window.location.href

          if (url.includes('signin')) {
            const elements = document.querySelectorAll('[href*="login"]')
            elements.forEach((element) => {
              element.target = ''

              const { href } = element
              if (href.includes('login')) {
                element.onclick = () => handleButtonClick(href)
                element.removeAttribute('href')
              }

              // TODO: Implement for 2-fa
            })
          }
        })
      }

      addEventsListeners()
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
