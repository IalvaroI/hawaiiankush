import { useEffect, useRef } from 'react'
import { Minus, Plus } from 'lucide-react'

// Minus, the count, plus. While a write is on its way the buttons say so (aria-disabled) but stay focusable, so a
// keyboard user's place is not lost with every tap; a tap meanwhile is ignored, as a disabled button's would be.
// `focusPlus` moves focus to the plus button once: for the stepper that takes the place of an Add to bag button the
// shopper had just pressed.
export function QuantityStepper({ quantity, onChange, busy, name, focusPlus = false }) {
  const plus = useRef(null)
  useEffect(() => { if (focusPlus) plus.current?.focus({ preventScroll: true }) }, [focusPlus])
  const tap = (delta) => { if (!busy) onChange(delta) }
  return (
    <div className="stepper">
      <button type="button" aria-disabled={busy || undefined} aria-label={quantity === 1 ? `Remove ${name} from bag` : `Remove one ${name}`} onClick={() => tap(-1)}><Minus size={16} /></button>
      <span aria-live="polite"><span className="sr-only">Quantity </span>{quantity}</span>
      <button type="button" ref={plus} aria-disabled={busy || undefined} aria-label={`Add one ${name}`} onClick={() => tap(1)}><Plus size={16} /></button>
    </div>
  )
}
