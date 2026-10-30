import { useState } from 'react'
import { Loader2, ShoppingCart } from 'lucide-react'
import { QuantityStepper } from '../../ui/QuantityStepper.jsx'
import { money } from '../../lib/format.js'

// The add-to-bag control. On phones it is a sticky bottom bar that also carries the price and, when there are several,
// the size it adds (see product.css): the size picker may be scrolled out of view.
export function ProductBuy({ name, size, variant, price, available, quantity, busy, onChange }) {
  const purchaseKey = variant?.purchaseKey
  // Whether the Add to bag button had focus when pressed: the stepper that replaces it then takes the focus.
  const [addHadFocus, setAddHadFocus] = useState(false)
  let control
  if (!available) {
    control = <button className="add-button" type="button" disabled>Sold out</button>
  } else if (quantity > 0) {
    control = <QuantityStepper quantity={quantity} busy={busy} name={name} focusPlus={addHadFocus} onChange={(delta) => onChange(purchaseKey, delta, name)} />
  } else {
    control = (
      <button className="add-button" type="button" disabled={busy || !purchaseKey} aria-label={`Add to bag: ${name}`} onClick={(event) => { setAddHadFocus(document.activeElement === event.currentTarget); onChange(purchaseKey, 1, name) }}>
        {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
        <span>Add to bag</span>
      </button>
    )
  }

  return (
    <div className="pd-buy">
      <span className="pd-buy-price">
        <strong>{money(price)}</strong>
        {size && <span className="pd-buy-size">{size}</span>}
      </span>
      {control}
    </div>
  )
}
