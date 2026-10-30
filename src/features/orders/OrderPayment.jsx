import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createPaymentLink } from './ordersApi.js'
import { paymentMethodLabel, paymentStatusInfo } from './orderModel.js'
import { errorText } from '../../lib/errors.js'

// Payment method and status, with Pay now when the store says an online payment can start.
// While the shopper is back from the payment page (confirming), it waits for the payment instead of offering to pay again.
export function OrderPayment({ order, confirming, timedOut, onCheckAgain }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const payment = order.payment
  const info = paymentStatusInfo(payment?.status)
  const paid = payment?.status === 'authorized' || payment?.status === 'paid'
  const rejected = payment?.transaction?.status === 'rejected'

  async function payNow() {
    setStarting(true)
    setError('')
    try {
      const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}orders/${encodeURIComponent(order.id)}?paid=1`
      const result = await createPaymentLink(order.id, redirectUrl)
      if (!result?.paymentLink) throw new Error('The store did not return a payment link.')
      window.location.assign(result.paymentLink)
    } catch (err) {
      setStarting(false)
      setError(errorText(err, 'Payment could not be started. Try again.'))
    }
  }

  let message = null
  if (paid) message = <p className="ord-note is-good" role="status">Payment received.</p>
  else if (rejected) message = <p className="ord-note is-bad" role="alert">Payment didn’t go through. You can try again.</p>
  else if (confirming) message = <p className="ord-note" role="status"><Loader2 size={16} aria-hidden="true" className="spin" /> Confirming your payment…</p>
  else if (timedOut) message = <p className="ord-note" role="status">We haven’t received your payment yet. It can take a few minutes.</p>

  const showPay = Boolean(payment?.isOnlinePaymentAvailable) && !confirming && !paid
  const showCheck = timedOut && !paid && !rejected

  return (
    <section className="ord-panel" aria-labelledby="ord-payment-title">
      <h2 id="ord-payment-title">Payment</h2>
      {payment ? (
        <dl className="ord-facts">
          <div><dt>Method</dt><dd>{paymentMethodLabel(payment, order)}</dd></div>
          <div>
            <dt>Status</dt>
            <dd><span className={`ord-pill tone-${info.tone}`}>{info.label}</span></dd>
          </div>
        </dl>
      ) : (
        <p className="ord-note">Payment details are not shown here. Contact the store with your order number.</p>
      )}
      {message}
      {showPay && (
        <button type="button" className="ord-pay-button ord-wide" onClick={payNow} disabled={starting}>
          {starting ? 'Opening payment…' : 'Pay now'}
        </button>
      )}
      {showCheck && <button type="button" className="secondary-button ord-wide" onClick={onCheckAgain}>Check again</button>}
      {error && <p className="ord-note is-bad" role="alert">{error}</p>}
    </section>
  )
}
