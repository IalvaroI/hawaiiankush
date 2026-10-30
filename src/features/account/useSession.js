import { useCallback, useEffect, useSyncExternalStore } from 'react'

// Who is signed in, shared by every component. The bearer token stays in the server's HttpOnly cookie; the browser
// only learns { signedIn, tokenType, userId, expiresAt } from GET /session. One module-level store, so the top bar,
// the sign-in page and the account page always agree.
const SESSION_URL = `${import.meta.env.BASE_URL}api/session`
const listeners = new Set()
let state = { session: null, loading: true, error: '' }
let latest = 0
let started = false

function publish(patch) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getState() {
  return state
}

// Reads the session. Resolves to it, or to null when the check failed (the last known session stays in place).
export async function loadSession() {
  const request = ++latest
  try {
    const response = await fetch(SESSION_URL, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Session check failed (${response.status})`)
    const session = await response.json()
    if (request === latest) publish({ session, loading: false, error: '' })
    return session
  } catch {
    if (request === latest) publish({ loading: false, error: 'We could not check your sign-in. Try again.' })
    return null
  }
}

// Clears the session cookie on the server, reloads the session, then calls onSignedOut. Throws if the server refused.
export async function signOutSession(onSignedOut) {
  const response = await fetch(`${SESSION_URL}/sign-out`, { method: 'POST', cache: 'no-store' })
  if (!response.ok && response.status !== 204) throw new Error(`Sign-out failed (${response.status})`)
  const session = await loadSession()
  onSignedOut?.(session)
  return session
}

export function useSession() {
  const snapshot = useSyncExternalStore(subscribe, getState, getState)

  useEffect(() => {
    if (started) return
    started = true
    loadSession()
  }, [])

  const signOut = useCallback((onSignedOut) => signOutSession(onSignedOut), [])

  return { session: snapshot.session, loading: snapshot.loading, error: snapshot.error, refresh: loadSession, signOut }
}
