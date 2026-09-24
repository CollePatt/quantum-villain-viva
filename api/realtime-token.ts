import type { IncomingMessage, ServerResponse } from 'node:http'
import OpenAI from 'openai'
import type {
  ClientSecretCreateParams,
  ClientSecretCreateResponse,
} from 'openai/resources/realtime/client-secrets'
import { TokenRequestSchema, type Topic } from '../src/domain/schemas'
import { getTopicById } from '../src/domain/topics'
import { buildVillainInstructions } from '../src/lib/examPrompts'
import {
  applyCors,
  enforceHostedAccess,
  getRuntimeConfig,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  sendServerError,
  sendValidationError,
} from '../server/serverless'

function realtimeSessionParams(
  topic: Topic,
  realtimeModel: string,
  realtimeVoice: string,
): ClientSecretCreateParams {
  return {
    expires_after: {
      anchor: 'created_at',
      seconds: 600,
    },
    session: {
      type: 'realtime',
      model: realtimeModel,
      instructions: buildVillainInstructions(topic),
      output_modalities: ['audio'],
      max_output_tokens: 900,
      tracing: null,
      audio: {
        input: {
          noise_reduction: {
            type: 'near_field',
          },
          transcription: {
            model: 'gpt-transcribe',
            prompt:
              'Quantum mechanics oral exam answer. Preserve physics vocabulary and symbols when possible.',
          },
          turn_detection: {
            type: 'semantic_vad',
            create_response: false,
            interrupt_response: true,
            eagerness: 'medium',
          },
        },
        output: {
          voice: realtimeVoice,
          speed: 0.86,
        },
      },
      reasoning: {
        effort: 'low',
      },
    },
  }
}

async function createClientSecret(
  apiKey: string,
  params: ClientSecretCreateParams,
): Promise<ClientSecretCreateResponse> {
  const client = new OpenAI({ apiKey })
  return client.realtime.clientSecrets.create(params)
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (applyCors(request, response)) {
    return
  }

  if (request.method !== 'POST') {
    sendMethodNotAllowed(response)
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch {
    sendValidationError(response)
    return
  }

  const parsed = TokenRequestSchema.safeParse(body)
  if (!parsed.success) {
    sendValidationError(response)
    return
  }

  const config = getRuntimeConfig()
  if (!enforceHostedAccess(request, response, config, body)) {
    return
  }

  if (!config.hasApiKey) {
    sendJson(response, 503, {
      error: {
        code: 'missing_openai_api_key',
        message:
          'Add OPENAI_API_KEY to .env to enable the live microphone exam. The typed demo and local grader still work.',
      },
      hasApiKey: false,
      realtimeModel: config.realtimeModel,
      realtimeVoice: config.realtimeVoice,
    })
    return
  }

  const topic = getTopicById(parsed.data.topicId)

  try {
    const secret = await createClientSecret(
      config.apiKey,
      realtimeSessionParams(topic, config.realtimeModel, config.realtimeVoice),
    )

    sendJson(response, 200, {
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      realtimeModel: config.realtimeModel,
      realtimeVoice: config.realtimeVoice,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not create a Realtime client secret.'
    sendServerError(response, message)
  }
}
