import { useSession } from '../account/useSession.js'

// Whether the shopper is signed in, from the shared session store (one /api/session request for the whole app).
// status: 'loading' | 'in' | 'out' | 'error'; retry() asks the server again.
export function useSignedIn() {
  const { session, loading, error, refresh } = useSession()
  const status = session ? (session.signedIn ? 'in' : 'out') : loading ? 'loading' : error ? 'error' : 'out'
  return { status, retry: refresh }
}
