import { WebClient } from '@slack/web-api'
import got from 'got'
import type { CookieJar } from 'tough-cookie'

import { NOT_USED_SLACK_URL } from './constants'

export default class SlackAPI {
  cookieJar: CookieJar

  userToken: string

  webClient: WebClient

  setLoginState = async (cookieJar: CookieJar, clientToken: string = '') => {
    if (!cookieJar && !clientToken) throw TypeError()
    this.cookieJar = cookieJar || null

    const token = clientToken || await this.getClientToken()

    const client = new WebClient(token)

    this.userToken = token
    this.webClient = client
  }

  getClientToken = async () => {
    const { body: workspacesBody } = await got(NOT_USED_SLACK_URL, { cookieJar: this.cookieJar })
    const filteredSlackWorkspaces = [NOT_USED_SLACK_URL, 'dev.slack.com']
    const alreadyConnectedUrls = workspacesBody.match(/([a-zA-Z0-9\-]+\.slack\.com)/g).filter((url: string) => !filteredSlackWorkspaces.includes(url)) || []
    // FIXME: this needs to be fixed, we need to get the one the user has already selected
    // on the browser login
    const firstWorkspace = alreadyConnectedUrls[0] || ''
    const { body: emojisBody } = await got(`https://${firstWorkspace}/customize/emoji`, { cookieJar: this.cookieJar })
    const token = emojisBody.match(/(xox[a-zA-Z]-[a-zA-Z0-9-]+)/g)[0] || ''

    return token
  }

  getCurrentUser = async () => {
    const auth: any = await this.webClient.auth.test()
    const user: any = await this.webClient.users.profile.get()
    user.profile.id = auth.user_id

    return user
  }

  getThreads = async () => {
    // FIXME: use pagination instead of limit 1000
    const response = await this.webClient.conversations.list({ types: 'im', limit: 20 })
    const currentUser = await this.getCurrentUser()

    for (const thread of response.channels as any[]) {
      const { id, user: userId } = thread
      const user = await this.getParticipantProfile(userId)

      thread.messages = await this.getMessages(id, 1) || []
      thread.participants = [user, currentUser] || []
    }

    return response
  }

  // FIXME: Use pagination instead of limit
  getMessages = async (threadId: string, limit: number = 20) => this.webClient.conversations.history({ channel: threadId, limit })

  getParticipantProfile = async (userId: string) => {
    const user: any = await this.webClient.users.profile.get({ user: userId })
    user.profile.id = userId
    return user
  }

  searchUsers = async (typed: string) => {
    const allUsers = await this.webClient.users.list()
    const { members } = allUsers

    return (members as any).filter(member => member.name.toLowerCase().includes(typed.toLowerCase()))
  }

  sendMessage = async (channel: string, text: string) => {
    const res = await this.webClient.chat.postMessage({ channel, text })
    return res.message
  }
}
