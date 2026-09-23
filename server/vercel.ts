import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from './app'

const app = createApp()

export default function handler(request: IncomingMessage, response: ServerResponse) {
  app(request, response)
}
