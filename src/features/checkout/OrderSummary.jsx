import { ChevronDown } from 'lucide-react'
import { money, receiptValue } from '../../lib/format.js'
import { availabilityText, positiveAmount } from './checkoutDraft.js'

// The bag lines, then the receipt exactly as Sweed formats it (groups open to their lines), then the total.
// On phones it starts collapsed behind a toggle that shows the total.
export function OrderSummary({ lines, receipt, total, open, onToggle }) {
  const thresholds = receipt?.deliveryThresholds
  const messages = [
    positiveAmount(thresholds?.amountLeftForMinOrder) && `Add ${money(thresholds.amountLeftForMinOrder)} more to reach the minimum order`,
    positiveAmount(thresholds?.amountLeftForFreeDelivery) && `Add ${money(thresholds.amountLeftForFreeDelivery)} more for free delivery`,
  ].filter(Boolean)
  const receiptItems = receipt?.items || []

  return (
    <aside className={`co-summary${open ? ' is-open' : ''}`} aria-labelledby="co-summary-title">
      <button type="button" className="co-summary-toggle" aria-expanded={open} aria-controls="co-summary-body" onClick={onToggle}>
        <span>{open ? 'Hide order summary' : 'Show order summary'}</span>
        <strong>{money(total)}</strong>
      </button>
      <div id="co-summary-body" className="co-summary-body">
        <h2 id="co-summary-title">Order summary</h2>
        <ul className="co-lines">
          {lines.map((line) => (
            <li className="co-line" key={line.purchaseKey}>
              <div className="co-line-info">
                <strong>{line.name}</strong>
                {line.detail && <span>{line.detail}</span>}
                <span>Qty {line.quantity}</span>
                {line.issues.map((reason) => <em className="co-line-issue" key={reason}>{availabilityText(reason)}</em>)}
              </div>
              <span className="co-line-price">{money(line.lineTotal)}</span>
            </li>
          ))}
        </ul>

        {receiptItems.length > 0 && (
          <div className="co-receipt">
            {receiptItems.map((row, index) => (row.type === 'group' ? (
              <details className="co-group" key={`group-${index}`}>
                <summary><span><ChevronDown size={14} aria-hidden="true" className="co-group-chevron" />{row.title}</span><span>{receiptValue(row.value)}</span></summary>
                <ul>
                  {(row.items || []).map((child, childIndex) => (
                    <li key={childIndex}><span>{child.title}</span><span>{receiptValue(child.value)}</span></li>
                  ))}
                </ul>
              </details>
            ) : (
              <div className="co-row" key={`row-${index}`}><span>{row.title}</span><span>{receiptValue(row.value)}</span></div>
            )))}
          </div>
        )}

        <div className="co-total"><span>Total</span><strong>{money(total)}</strong></div>
        {messages.map((message) => <p className="co-threshold" key={message}>{message}</p>)}

        <div className="co-age">
          <strong>21+ with valid ID</strong>
          <span>Bring a photo ID to pickup.</span>
        </div>
      </div>
    </aside>
  )
}
