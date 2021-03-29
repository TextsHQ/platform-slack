import { WebClient } from '@slack/web-api'
import got from 'got'
import crypto from 'crypto'
import util from 'util'
import { CookieJar, Cookie } from 'tough-cookie'
import { texts, ReAuthError } from '@textshq/platform-sdk'

const { constants, IS_DEV, Sentry } = texts
const { USER_AGENT } = constants

const AUTHORIZATION = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

const token = process.env.SLACK_TOKEN;

function handleErrors(url: string, statusCode: number, json: any) {
  // { errors: [ { code: 32, message: 'Could not authenticate you.' } ] }
  const errors = json.errors as { code: number, message: string }[]
  const loggedOutError = errors.find(e => e.code === 32)
  if (loggedOutError) {
    throw new ReAuthError(loggedOutError!.message)
    // todo track reauth event
  }
  console.log(url, statusCode, json.errors)
  // [ { code: 130, message: 'Over capacity' } ]
  // [ { code: 392, message: 'Session not found.' } ]
  const filteredErrors = errors.filter(err => err.code !== 130 && err.code !== 392)
  if (filteredErrors.length > 0) {
    Sentry.captureException(Error(url), {
      extra: {
        errors: json.errors,
      },
    })
  }
}

const ENDPOINT = 'https://api.twitter.com/'
const CT0_MAX_AGE = 6 * 60 * 60
const EXT = 'mediaColor,altText,mediaStats,highlightedLabel,cameraMoment'

const randomBytes = util.promisify(crypto.randomBytes)


const commonParams = {
  include_profile_interstitial_type: '1',
  include_blocking: '1',
  include_blocked_by: '1',
  include_followed_by: '1',
  include_want_retweets: '1',
  include_mute_edge: '1',
  include_can_dm: '1',
  include_can_media_tag: '1',
  skip_status: '1',
}

const commonDMParams = {
  cards_platform: 'Web-12',
  include_cards: '1',
  include_composer_source: 'true',
  include_ext_alt_text: 'true',
  include_reply_count: '1',
  tweet_mode: 'extended',
  dm_users: 'false',
  include_groups: 'true',
  include_inbox_timelines: 'true',
  include_ext_media_color: 'true',
  supports_reactions: 'true',
}

const commonHeaders = {
  'Accept-Language': 'en',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': USER_AGENT,
}

const staticFetchHeaders = {
  Authorization: AUTHORIZATION,
  Accept: '*/*',
  'x-twitter-active-user': 'yes',
  'x-twitter-auth-type': 'OAuth2Session',
  'x-twitter-client-language': 'en',
}

const genCSRFToken = () =>
  randomBytes(16).then(b => b.toString('hex'))

export default class SlackAPI {
  private web = new WebClient(token);

  private csrfToken: string = ''

  cookieJar: CookieJar = null

  fetch = async ({ headers = {}, referer, ...rest }) => {
    if (!this.cookieJar) throw new Error('Slack cookie jar not found')
    if (IS_DEV) console.log('[TW] CALLING', rest.url)
    await this.setCSRFTokenCookie()
    try {
      const res = await got({
        // http2: true,
        throwHttpErrors: false,
        cookieJar: this.cookieJar,
        headers: {
          'x-csrf-token': this.csrfToken,
          ...staticFetchHeaders,
          Referer: referer,
          ...commonHeaders,
          ...headers,
        },
        ...rest,
        // ...(this.twitterBlocked ? { url: replaceHostname(rest.url) } : {}),
      })
      if (!res.body) return
      const json = JSON.parse(res.body)
      // if (res.statusCode === 429) {
      //   throw new RateLimitError()
      // }
      if (json.errors) {
        handleErrors(res.url, res.statusCode, json)
      }
      return json
    } catch (err) {
      if (err.code === 'ECONNREFUSED' && (err.message.endsWith('0.0.0.0:443') || err.message.endsWith('127.0.0.1:443'))) {
        console.log('twitter is blocked')
        throw Error('Twitter seems to be blocked on your device. This could have been done by an app or a manual entry in /etc/hosts')
        // this.twitterBlocked = true
        // await resolveHost(rest.url)
        // return this.fetch({ headers, referer, ...rest })
      }
      throw err
    }
  }

  setCSRFTokenCookie = async () => {
    const cookies = this.cookieJar.getCookiesSync('https://twitter.com/')
    this.csrfToken = cookies.find(c => c.key === 'ct0')?.value
    if (!this.csrfToken) {
      this.csrfToken = await genCSRFToken()
      const cookie = new Cookie({ key: 'ct0', value: this.csrfToken, secure: true, hostOnly: false, domain: 'twitter.com', maxAge: CT0_MAX_AGE })
      this.cookieJar.setCookie(cookie, 'https://twitter.com/')
    }
  }

  setLoginState = async (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError()
    this.cookieJar = cookieJar
    await this.setCSRFTokenCookie()
  }

  account_verify_credentials = () =>
    this.fetch({
      url: `${ENDPOINT}1.1/account/verify_credentials.json`,
      referer: 'https://twitter.com/',
    })

  getThreads = async () => {
    console.log("get threads");
    try {
      const result = await this.web.users.conversations();
      console.log(result);
    } catch (e) {
      console.log(e);
    }
  }

  get_current_user = () => {
    console.log("get current user");
  }

  typeahead = (q: string) =>
    this.fetch({
      url: `${ENDPOINT}1.1/search/typeahead.json`,
      searchParams: {
        q,
        src: 'compose_message',
        result_type: 'users',
      },
      referer: 'https://twitter.com/messages/compose',
    })

  dm_inbox_timeline = (inboxType: string, pagination: { min_id?: string, max_id?: string }) =>
    this.fetch({
      url: `${ENDPOINT}1.1/dm/inbox_timeline/${inboxType}.json`,
      referer: 'https://twitter.com/messages',
      searchParams: {
        ...commonParams,
        ...commonDMParams,
        filter_low_quality: 'false',
        ...pagination,
        ext: EXT,
      },
    })

  dm_inbox_initial_state = () =>
    this.fetch({
      url: `${ENDPOINT}1.1/dm/inbox_initial_state.json`,
      referer: 'https://twitter.com/messages',
      searchParams: {
        ...commonParams,
        ...commonDMParams,
        filter_low_quality: 'false',
        ext: EXT,
      },
    })

  dm_conversation_typing = (threadID: string) =>
    this.fetch({
      method: 'POST',
      url: `${ENDPOINT}1.1/dm/conversation/${threadID}/typing.json`,
      referer: `https://twitter.com/messages/${threadID}`,
    })

  dm_conversation_mark_read = (threadID: string, messageID: string) =>
    this.fetch({
      method: 'POST',
      url: `${ENDPOINT}1.1/dm/conversation/${threadID}/mark_read.json`,
      referer: `https://twitter.com/messages/${threadID}`,
      form: {
        conversationId: threadID,
        last_read_event_id: messageID,
      },
    })

}
