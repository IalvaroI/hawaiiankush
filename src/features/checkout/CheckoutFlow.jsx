import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { useContent } from '../../lib/content.js'
import { cartLines } from '../cart/cartLines.js'
import { ContactStep } from './ContactStep.jsx'
import { FulfillmentStep } from './FulfillmentStep.jsx'
import { OrderSummary } from './OrderSummary.jsx'
import { PaymentStep } from './PaymentStep.jsx'
import { ReconcilePanel } from './ReconcilePanel.jsx'
import { ReviewStep } from './ReviewStep.jsx'
import { TimeStep } from './TimeStep.jsx'
import { useCheckout } from './useCheckout.js'
import {
  allRequiredDone, availabilityText, fulfillmentChoices, isGuestCheckout, openStepFor, skippedSteps, STEPS, stepDone, visibleSteps,
} from './checkoutDraft.js'

// The whole checkout once the bag has items: the steps on the left, the summary on the right.
export function CheckoutFlow({ onPlaced }) {
  const { cartId, cart, cartTotal, refreshCart, resetCart, store, openBag, lapseSignIn } = useCart()
  const { pickupReadyText } = useContent()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const flow = useCheckout({ cartId, refreshCart, resetCart, onPlaced, onSignInLapsed: lapseSignIn })
  const { checkout, draft, guest, setGuest, changes, loadError, busy, errors, reload, updateDraft, saveStep, applyPromo, removePromo, setLoyaltyPoints, placeOrder, acknowledgeChanges } = flow
  const [params, setParams] = useSearchParams()
  const askedStep = params.get('step')
  const ready = Boolean(checkout && draft)

  // ?step=fulfillment (the bag rail's pickup Change) opens that step once checkout has loaded. A step that can't be
  // reached yet falls back to the first unfinished one, as for any other step.
  useEffect(() => {
    if (!ready || !askedStep) return
    if (STEPS.includes(askedStep)) updateDraft({ step: askedStep })
    setParams((current) => { const next = new URLSearchParams(current); next.delete('step'); return next }, { replace: true })
  }, [ready, askedStep, updateDraft, setParams])

  if (!checkout || !draft) {
    return (
      <div className="sheet co-page">
        {loadError ? (
          <section className="co-empty">
            <h1>Checkout</h1>
            <p className="co-alert" role="alert">{loadError}</p>
            <button type="button" className="primary-button" onClick={reload}>Try again</button>
          </section>
        ) : (
          <p className="co-loading" role="status"><Loader2 className="spin" size={18} aria-hidden="true" /> Loading checkout…</p>
        )}
      </div>
    )
  }

  const { options, receipt, loyalty } = checkout
  const visible = visibleSteps(options)
  const skipped = skippedSteps(options)
  const openStep = openStepFor(draft, options)
  const allDone = allRequiredDone(draft, options)
  const unavailable = cart?.checkoutAvailability?.state === 'unavailable'
  const reasons = cart?.checkoutAvailability?.reasons || []
  const blocked = unavailable || changes.length > 0
  const total = receipt?.totals?.total ?? cartTotal
  const lines = cartLines(cart).map((line) => ({
    ...line,
    issues: cart.items.find((item) => item.purchaseKey === line.purchaseKey)?.checkoutAvailability?.reasons || [],
  }))
  const numberOf = (key) => visible.indexOf(key) + 1
  const done = (key) => stepDone(draft, skipped, key)
  const editing = (key) => () => updateDraft({ step: key })
  const delivering = draft.choice === 'delivery'

  return (
    <div className="sheet co-page">
      <header className="co-head">
        <h1>Checkout</h1>
      </header>

      {unavailable && (
        <section className="co-alert is-block" role="alert" aria-labelledby="co-blocked-title">
          <h2 id="co-blocked-title">You can’t place this order yet</h2>
          <ul>
            {(reasons.length ? reasons : ['unknown']).map((reason) => <li key={reason}>{availabilityText(reason)}</li>)}
          </ul>
          <button type="button" className="secondary-button" onClick={openBag}>Review your bag</button>
        </section>
      )}

      {changes.length > 0 && <ReconcilePanel changes={changes} busy={busy === 'changes'} onContinue={acknowledgeChanges} />}

      {loadError && (
        <p className="co-alert" role="alert">
          {loadError} <button type="button" className="secondary-button" onClick={reload}>Try again</button>
        </p>
      )}

      <div className="co-layout">
        <div className="co-steps">
          {/* Signed in, Sweed takes the contact from the account, so there is no guest step to show. */}
          {visible.includes('contact') && (
            <ContactStep
              number={numberOf('contact')}
              open={openStep === 'contact'}
              done={done('contact')}
              guest={guest}
              setGuest={setGuest}
              busy={busy}
              error={errors.contact}
              onContinue={() => saveStep('contact')}
              onEdit={editing('contact')}
            />
          )}

          <FulfillmentStep
            number={numberOf('fulfillment')}
            open={openStep === 'fulfillment'}
            done={done('fulfillment')}
            draft={draft}
            updateDraft={updateDraft}
            choices={fulfillmentChoices(options.deliveryMethods?.items)}
            store={store}
            pickupReadyText={pickupReadyText}
            busy={busy}
            error={errors.fulfillment}
            onContinue={() => saveStep('fulfillment')}
            onPickupInstead={(choice) => saveStep('fulfillment', { choice })}
            onEdit={editing('fulfillment')}
          />

          {visible.includes('time') && (
            <TimeStep
              number={numberOf('time')}
              open={openStep === 'time'}
              done={done('time')}
              draft={draft}
              updateDraft={updateDraft}
              windows={options.timeWindows}
              busy={busy}
              error={errors.time}
              onContinue={() => saveStep('time')}
              onEdit={editing('time')}
            />
          )}

          {visible.includes('payment') && (
            <PaymentStep
              number={numberOf('payment')}
              open={openStep === 'payment'}
              done={done('payment')}
              draft={draft}
              updateDraft={updateDraft}
              methods={options.paymentMethods}
              delivering={delivering}
              busy={busy}
              error={errors.payment}
              onContinue={() => saveStep('payment')}
              onEdit={editing('payment')}
            />
          )}

          <ReviewStep
            number={numberOf('review')}
            open={openStep === 'review'}
            allDone={allDone}
            draft={draft}
            updateDraft={updateDraft}
            total={total}
            blocked={blocked}
            busy={busy}
            errors={errors}
            onOpen={editing('review')}
            onPlace={placeOrder}
            onApplyPromo={applyPromo}
            onRemovePromo={removePromo}
            showLoyalty={!isGuestCheckout() && Boolean(loyalty)}
            loyalty={loyalty}
            onLoyalty={setLoyaltyPoints}
          />
        </div>

        <OrderSummary
          lines={lines}
          receipt={receipt}
          total={total}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((current) => !current)}
        />
      </div>
    </div>
  )
}
