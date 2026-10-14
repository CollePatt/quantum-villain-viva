import { describe, expect, it } from 'vitest'
import { androidBrowserUrl, detectInAppBrowser } from './inAppBrowser'

const LINKEDIN_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31.1234'
const LINKEDIN_ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 [LinkedInApp]/4.1.1100'
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

describe('detectInAppBrowser', () => {
  it('spots the LinkedIn app on iOS and Android', () => {
    expect(detectInAppBrowser(LINKEDIN_IOS)).toEqual({ app: 'LinkedIn', platform: 'ios' })
    expect(detectInAppBrowser(LINKEDIN_ANDROID)).toEqual({ app: 'LinkedIn', platform: 'android' })
  })

  it('leaves real browsers alone', () => {
    expect(detectInAppBrowser(SAFARI)).toBeNull()
  })
})

describe('androidBrowserUrl', () => {
  it('builds an intent link that keeps the path and query', () => {
    expect(androidBrowserUrl('https://quantum-villain-viva.vercel.app/?ref=li')).toBe(
      'intent://quantum-villain-viva.vercel.app/?ref=li#Intent;scheme=https;end',
    )
  })
})
