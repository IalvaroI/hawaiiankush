import { AlertCircle, ArrowRight, Tag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { money } from '../../lib/format.js'
import { cartLimits, checkoutBlock, promotionNudge, totalsView } from './cartLines.js'
import './cart.css'

// Purchase limits as progress bars. Hidden when the store sends none.
export function LimitMeters({ cart }) {
  const limits = cartLimits(cart)
  if (!limits.length) return null
  return (
    <section className="cart-limits" aria-label="Purchase limits">
      {limits.map((limit) => (
        <div className="cart-limit" data-level={limit.level} key={limit.key}>
          <p className="cart-limit-text">{limit.text}</p>
          <div
            className="cart-limit-bar"
            role="progressbar"
            aria-label={limit.label}
            aria-valuetext={limit.text}
            aria-valuemin={0}
            aria-valuemax={limit.max}
            aria-valuenow={Math.min(limit.used, limit.max)}
          >
            <span style={{ width: `${Math.min(limit.ratio, 1) * 100}%` }} />
          </div>
          {limit.level === 'over' && <p className="cart-limit-message">Over the limit — remove some items to check out</p>}
        </div>
      ))}
    </section>
  )
}

// Why the cart cannot go to checkout, in plain language. Shown only when the store says checkout is unavailable.
export function AvailabilityNotice({ cart }) {
  const { blocked, messages } = checkoutBlock(cart)
  if (!blocked) return null
  return (
    <div className="cart-notice" role="status">
      <AlertCircle size={18} aria-hidden="true" />
      <ul>
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  )
}

// Reasons one line cannot be bought, with a quick Remove. The button's name starts with "Remove unavailable item" so it
// never clashes with the stepper's and the rail's "Remove {name}" buttons.
export function LineNotices({ line, onRemove }) {
  if (!line.notices.length) return null
  return (
    <div className="cart-line-notice">
      <ul>
        {line.notices.map((notice) => <li key={notice}>{notice}</li>)}
      </ul>
      <button type="button" className="line-remove" aria-label={`Remove unavailable item ${line.name}`} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /> Remove</button>
    </div>
  )
}

// Names of the promotions applied to one line.
export function PromoChips({ names }) {
  if (!names?.length) return null
  return (
    <ul className="cart-chips" aria-label="Applied promotions">
      {names.map((name) => <li key={name}><Tag size={12} aria-hidden="true" />{name}</li>)}
    </ul>
  )
}

// A line's price. With a discount the base line total is struck through before the discounted one.
export function LinePrice({ line, className = '' }) {
  return (
    <span className={`line-price ${className}`.trim()}>
      {line.hasDiscount && <s className="line-price-was">{money(line.lineBase)}</s>}
      <strong>{money(line.lineTotal)}</strong>
    </span>
  )
}

// Totals with the base struck through and the discounted total when a discount applies, then the saving.
export function CartTotals({ totals, label = 'Estimated total', fallback }) {
  const view = totalsView(totals)
  return (
    <div className="cart-totals">
      <div className="cart-total-row">
        <span>{label}</span>
        <span className="cart-total-figures">
          {view.hasDiscount && <s>{money(view.base)}</s>}
          <strong>{money(view.total ?? fallback)}</strong>
        </span>
      </div>
      {view.hasDiscount && <p className="cart-savings">You save {money(view.discount)}</p>}
    </div>
  )
}

// A gentle nudge toward the deals page when the store recommends promotions for the bag.
export function PromoNudge({ cart }) {
  const nudge = promotionNudge(cart)
  if (!nudge) return null
  const names = nudge.names.length ? nudge.names.join(' · ') : `${nudge.count} ${nudge.count === 1 ? 'deal is' : 'deals are'} available`
  return (
    <aside className="cart-nudge" aria-label="Deals for your bag">
      <p className="eyebrow">Deals for your bag</p>
      <p>{names}</p>
      <Link className="cart-nudge-link" to="/deals">See deals <ArrowRight size={14} aria-hidden="true" /></Link>
    </aside>
  )
}
