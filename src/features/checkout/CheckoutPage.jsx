import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, ShoppingBag } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { CheckoutFlow } from './CheckoutFlow.jsx'
import { OrderConfirmed } from './OrderConfirmed.jsx'
import { setSignedIn } from './checkoutDraft.js'
import { useSession } from '../account/useSession.js'
import './checkout.css'

// /checkout: an empty bag, a loading or failed bag, the checkout steps, or the confirmation once an order is placed.
export function CheckoutPage() {
  const { cartId, cart, refreshCart, signInLapsed } = useCart()
  const navigate = useNavigate()
  const [placed, setPlaced] = useState(null)
  const [bag, setBag] = useState(cartId ? 'loading' : 'ready')
  const { session, loading: sessionLoading } = useSession()
  setSignedIn(session?.signedIn)

  function loadBag() {
    setBag('loading')
    return refreshCart(cartId).then((next) => setBag(next ? 'ready' : 'failed'))
  }

  // The bag is read fresh on every visit; checkout data is never cached.
  useEffect(() => {
    if (cartId) loadBag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartId])

  if (placed) return <OrderConfirmed placed={placed} onKeepShopping={() => navigate('/')} />
  // The sign-in ended partway: the bag is the account's and waits there, along with the steps done so far.
  if (signInLapsed && !session?.signedIn) return <SignInEnded />
  if (!cartId) return <EmptyBag />
  if (cart?.items?.length && !sessionLoading) return <CheckoutFlow onPlaced={setPlaced} />
  if (bag === 'loading' || sessionLoading) {
    return <div className="sheet co-page"><p className="co-loading" role="status"><Loader2 className="spin" size={18} aria-hidden="true" /> Loading your bag…</p></div>
  }
  if (bag === 'failed') {
    return (
      <div className="sheet co-page">
        <section className="co-empty">
          <h1>We couldn’t load your bag</h1>
          <p>Check your connection and try again.</p>
          <button type="button" className="primary-button" onClick={loadBag}>Try again</button>
        </section>
      </div>
    )
  }
  return <EmptyBag />
}

function SignInEnded() {
  return (
    <div className="sheet co-page">
      <section className="co-empty" role="alert">
        <h1>Your sign-in has ended</h1>
        <p>Sign in again to finish your order. Your bag and the steps you’ve done are kept.</p>
        <Link className="primary-button" to="/sign-in?next=%2Fcheckout">Sign in</Link>
      </section>
    </div>
  )
}

function EmptyBag() {
  return (
    <div className="sheet co-page">
      <section className="co-empty">
        <ShoppingBag size={32} strokeWidth={1.5} aria-hidden="true" />
        <h1>Your bag is empty</h1>
        <p>Add something from the menu, then come back to check out.</p>
        <Link className="primary-button" to="/">Browse the menu</Link>
      </section>
    </div>
  )
}
