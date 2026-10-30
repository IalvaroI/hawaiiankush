import { Store, Truck } from 'lucide-react'
import { useContent } from '../../lib/content.js'
import { useCart } from '../../layout/CartContext.jsx'
import { fulfillmentLabel, readDraft, windowEnded, windowSummary } from '../checkout/checkoutDraft.js'

// How the order will be collected, on the rail and the bag page: the method and time window saved at checkout (kept
// for this tab), or the store's usual ready time until then. "Change" opens checkout at that step.
export function PickupCard({ className }) {
  const { cartId, openCheckout } = useCart()
  const { pickupReadyText } = useContent()
  const draft = cartId ? readDraft(cartId) : null
  const chosen = draft?.done?.fulfillment && draft.choice ? draft.choice : ''
  const delivering = chosen === 'delivery'
  const window = draft?.done?.time && draft.timeWindow && !windowEnded(draft.timeWindow) ? draft.timeWindow : null
  const when = window ? windowSummary(window) : delivering ? '' : pickupReadyText
  const Icon = delivering ? Truck : Store

  return (
    <div className={className}>
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{chosen ? fulfillmentLabel(chosen) : 'Pickup'}</strong>
        {when && <span>{when}</span>}
      </div>
      <button type="button" className="rail-link" aria-label={delivering ? 'Change delivery' : 'Change pickup'} onClick={() => openCheckout('fulfillment')}>Change</button>
    </div>
  )
}
