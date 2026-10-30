import { money } from '../../lib/format.js'
import { inStock, priceOf } from './productModel.js'

// Sizes labelled by package and potency. Each shows its own price, red when `isSale` says the size has a deal of its
// own; out-of-stock sizes are disabled and say so.
export function VariantPicker({ variants, labels, index, isSale, onSelect }) {
  return (
    <div className="pd-sizes" role="group" aria-labelledby="pd-size-label">
      <p id="pd-size-label" className="pd-label">Size</p>
      <div className="pd-size-list">
        {variants.map((option, position) => {
          const { now, was } = priceOf(option)
          const available = inStock(option)
          return (
            <button
              key={option.purchaseKey || option.id || position}
              type="button"
              className="pd-size"
              aria-pressed={position === index}
              disabled={!available}
              onClick={() => onSelect(option.id)}
            >
              <span className="pd-size-label">{labels[position]}</span>
              <span className="pd-size-price">
                {was != null && <del>{money(was)}</del>}
                <strong className={isSale(option) ? 'is-sale' : ''}>{money(now)}</strong>
              </span>
              {!available && <span className="pd-size-out">Sold out</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
