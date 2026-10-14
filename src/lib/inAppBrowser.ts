// Social apps open links in their own embedded browser, where the microphone and speech
// recognition are often blocked. Spot the common ones so the game can suggest a real browser.
const IN_APP_PATTERNS: Array<[RegExp, string]> = [
  [/LinkedInApp/i, 'LinkedIn'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/Twitter|TwitterAndroid/i, 'X'],
  [/Snapchat/i, 'Snapchat'],
  [/TikTok|musical_ly|Bytedance/i, 'TikTok'],
  [/\bLine\//i, 'LINE'],
]

export type InAppBrowser = {
  app: string
  platform: 'ios' | 'android' | 'other'
}

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  const match = IN_APP_PATTERNS.find(([pattern]) => pattern.test(userAgent))
  if (!match) {
    return null
  }
  const platform = /Android/i.test(userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(userAgent) ? 'ios' : 'other'
  return { app: match[1], platform }
}

// Android hands intent:// links to Chrome (or the default browser), leaving the in-app view.
export function androidBrowserUrl(href: string): string {
  const url = new URL(href)
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};end`
}
