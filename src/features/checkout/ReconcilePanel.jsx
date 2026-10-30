import { Loader2 } from 'lucide-react'
import { money } from '../../lib/format.js'

// What the store changed in the bag, in the store's own numbers. A null "current" means the item is gone.
export function changeLines(change) {
  const lines = []
  const gone = 'Removed — sold out'
  if (change.price) {
    if (change.price.current == null) lines.push(gone)
    else if (change.price.previous == null) lines.push(`Added at ${money(change.price.current)}`)
    else lines.push(`Price changed ${money(change.price.previous)} → ${money(change.price.current)}`)
  }
  if (change.qty) {
    if (change.qty.current == null) lines.push(gone)
    else if (change.qty.previous == null) lines.push(`Added ${Number(change.qty.current)}`)
    else lines.push(`Quantity changed ${Number(change.qty.previous)} → ${Number(change.qty.current)}`)
  }
  return [...new Set(lines.length ? lines : ['Changed'])]
}

export function ReconcilePanel({ changes, busy, onContinue }) {
  return (
    <section className="co-reconcile" role="alert" aria-labelledby="co-reconcile-title">
      <h2 id="co-reconcile-title">Some items in your bag changed</h2>
      <p>Look over the changes, then continue to place your order.</p>
      <ul className="co-changes">
        {changes.map((change) => {
          const image = change.variant?.images?.[0]
          return (
            <li className="co-change" key={change.purchaseKey}>
              {image ? <img src={image} alt="" loading="lazy" /> : <span className="co-change-empty" aria-hidden="true" />}
              <div>
                <strong>{change.variant?.name || 'Item'}</strong>
                {change.variant?.variantName && <span>{change.variant.variantName}</span>}
                {changeLines(change).map((line) => <p key={line}>{line}</p>)}
              </div>
            </li>
          )
        })}
      </ul>
      <button type="button" className="primary-button" disabled={busy} onClick={onContinue}>
        {busy && <Loader2 className="spin" size={18} aria-hidden="true" />} Review and continue
      </button>
    </section>
  )
}
