import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  applyCors,
  configPayload,
  getRuntimeConfig,
  sendJson,
  sendMethodNotAllowed,
} from '../server/serverless'

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method !== 'GET') {
    sendMethodNotAllowed(response)
    return
  }

  sendJson(response, 200, configPayload(getRuntimeConfig()))
}
