import { SignInPrompt } from './SignInPrompt.jsx'
import { OrdersList } from './OrdersList.jsx'
import { useSignedIn } from './useSignedIn.js'
import './orders.css'

// /orders: the signed-in shopper's order history. Signed out, it asks them to sign in.
export function OrdersPage() {
  const session = useSignedIn()
  if (session.status === 'out') return <SignInPrompt />
  return (
    <div className="sheet ord-page">
      <div className="ord-wrap">
        {session.status === 'loading' && <p className="ord-muted" role="status">Loading your orders…</p>}
        {session.status === 'error' && (
          <div className="ord-state" role="alert">
            <h1>Couldn’t check your sign-in</h1>
            <p>Check your connection and try again.</p>
            <button type="button" className="primary-button ord-state-action" onClick={session.retry}>Try again</button>
          </div>
        )}
        {session.status === 'in' && <OrdersList onProblem={session.retry} />}
      </div>
    </div>
  )
}
