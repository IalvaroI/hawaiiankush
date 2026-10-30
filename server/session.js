// Session cookie helpers. The bearer token lives only in this HttpOnly cookie, so browser JavaScript never sees it.
export const SESSION_COOKIE = 'maui_session'

export function encodeSession(session) {
  return Buffer.from(JSON.stringify(session)).toString('base64url')
}

// Returns the session only if it decodes cleanly and has not expired; anything else counts as signed out.
export function readSession(cookieHeader, now = Date.now()) {
  const pair = String(cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  if (!pair) return null
  try {
    const data = JSON.parse(Buffer.from(pair.slice(SESSION_COOKIE.length + 1), 'base64url').toString('utf8'))
    if (typeof data.token !== 'string' || !data.token || !(Date.parse(data.expiresAt) > now)) return null
    return { token: data.token, tokenType: data.type ?? null, userId: data.userId ?? null, expiresAt: data.expiresAt }
  } catch {
    return null
  }
}

export function serializeSessionCookie(value, { maxAge, path, secure }) {
  return [`${SESSION_COOKIE}=${value}`, `Max-Age=${maxAge}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; ')
}
