/// <reference lib="es2017" />

/**
 * This library is added because the Real-Time package created by Slack's team
 * has some issues with the subscriptions.
 *
 * The biggest change is that instead of creating a new 'Slack Web Client' it receives
 * one in the constructor, so that way we can update the headers and use the same one
 * as in the API integration.
 *
 * @see https://github.com/slackapi/node-slack-sdk/tree/main/packages/rtm-api
 */
export { RTMClient, RTMClientOptions, RTMStartOptions, RTMCallResult } from './RTMClient'
export { CodedError, ErrorCode, RTMPlatformError, RTMWebsocketError, RTMNoReplyReceivedError, RTMSendWhileDisconnectedError, RTMSendWhileNotReadyError, RTMCallError } from './errors'
