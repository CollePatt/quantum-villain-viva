import type { IncomingMessage, ServerResponse } from 'node:http'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { gradeExamLocally } from '../src/domain/grading'
import {
  ExamReportSchema,
  GradeRequestSchema,
  type ExamMetrics,
  type ExamReport,
  type ExamTurn,
  type Topic,
} from '../src/domain/schemas'
import { getTopicById } from '../src/domain/topics'
import { buildGradingPrompt } from '../src/lib/examPrompts'
import {
  applyCors,
  enforceHostedAccess,
  getRuntimeConfig,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  sendValidationError,
} from '../server/serverless'

async function gradeWithOpenAI(
  apiKey: string,
  graderModel: string,
  topic: Topic,
  turns: ExamTurn[],
  metrics: ExamMetrics,
): Promise<ExamReport> {
  const client = new OpenAI({ apiKey })
  const result = await client.responses.parse({
    model: graderModel,
    input: [
      {
        role: 'system',
        content: buildGradingPrompt(topic),
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            rubric: topic.questions,
            turns,
            requiredShape:
              'Return an ExamReport. Use source "openai", maxScore 6, and preserve measuredBehavior exactly.',
            measuredBehavior: metrics,
          },
          null,
          2,
        ),
      },
    ],
    text: {
      format: zodTextFormat(ExamReportSchema, 'quantum_viva_exam_report'),
    },
  })

  const parsed = result.output_parsed
  if (!parsed) {
    throw new Error('OpenAI returned no structured scorecard.')
  }

  return ExamReportSchema.parse({
    ...parsed,
    topicId: topic.id,
    maxScore: topic.questions.length * 2,
    measuredBehavior: metrics,
    source: 'openai',
    createdAt: new Date().toISOString(),
  })
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

  const parsed = GradeRequestSchema.safeParse(body)
  if (!parsed.success) {
    sendValidationError(response, 'Expected topicId, one to three turns, and metrics.')
    return
  }

  const config = getRuntimeConfig()
  const topic = getTopicById(parsed.data.topicId)

  if (!enforceHostedAccess(request, response, config, body)) {
    return
  }

  if (!config.hasApiKey) {
    sendJson(response, 200, gradeExamLocally(topic, parsed.data.turns, parsed.data.metrics))
    return
  }

  try {
    sendJson(
      response,
      200,
      await gradeWithOpenAI(
        config.apiKey,
        config.graderModel,
        topic,
        parsed.data.turns,
        parsed.data.metrics,
      ),
    )
  } catch {
    sendJson(response, 200, gradeExamLocally(topic, parsed.data.turns, parsed.data.metrics))
  }
}
