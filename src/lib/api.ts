const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
const ACCESS_CODE_STORAGE_KEY = 'quantum-villain-viva-access-code'

export type AppConfig = {
  hasApiKey: boolean
  requiresAccessCode: boolean
  realtimeModel: string
  realtimeVoice: string
  graderModel: string
}

export const STATIC_PREVIEW_CONFIG: AppConfig = {
  hasApiKey: false,
  requiresAccessCode: false,
  realtimeModel: 'gpt-realtime-2.1',
  realtimeVoice: 'ash',
  graderModel: 'local-heuristic',
}

// GitHub Pages serves the static build with no API behind it.
export function isStaticPreview(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('github.io') &&
    API_BASE_URL.length === 0
  )
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export class ApiError extends Error {
  status: number
  code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    let code: string | undefined
    try {
      const body = (await response.json()) as { error?: { message?: string; code?: string } }
      message = body.error?.message ?? message
      code = body.error?.code
    } catch {
      // Non-JSON error bodies keep the status text.
    }
    throw new ApiError(message, response.status, code)
  }

  return response.json() as Promise<T>
}

export function readStored(key: string): string {
  try {
    return window.localStorage?.getItem?.(key) ?? ''
  } catch {
    return ''
  }
}

export function writeStored(key: string, value: string) {
  try {
    if (value) {
      window.localStorage?.setItem?.(key, value)
    } else {
      window.localStorage?.removeItem?.(key)
    }
  } catch {
    // Private browsing and test environments may block storage.
  }
}

export function readAccessCode(): string {
  return readStored(ACCESS_CODE_STORAGE_KEY)
}

export function writeAccessCode(code: string) {
  writeStored(ACCESS_CODE_STORAGE_KEY, code)
}

export function accessHeaders(code: string): Record<string, string> {
  const clean = code.trim()
  return clean ? { 'X-Viva-Access-Code': clean } : {}
}
