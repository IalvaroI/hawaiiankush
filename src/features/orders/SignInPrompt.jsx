import { Link, useLocation } from 'react-router-dom'
import { AccountFrame } from '../account/AccountFrame.jsx'
import '../account/account.css'

// Shown instead of order data when the shopper is signed out, in the same card as the sign-in page. `next` brings
// them back to this page after sign-in.
export function SignInPrompt() {
  const { pathname, search } = useLocation()
  return (
    <AccountFrame narrow card title="Sign in to see your orders" lead="Your order history, receipts and payment links appear here once you’re signed in. New here? Signing in with your email creates your account.">
      <div className="acct-actions">
        <Link className="primary-button" to={`/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`}>Sign in</Link>
      </div>
    </AccountFrame>
  )
}
