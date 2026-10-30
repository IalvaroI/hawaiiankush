import { useMemo, useState } from 'react'
import { Heart, Loader2, ShoppingCart } from 'lucide-react'
import { ProductImage } from '../../ui/ProductImage.jsx'
import { QuantityStepper } from '../../ui/QuantityStepper.jsx'
import { hasFigures, noFiguresNote, potencyOf, terpeneProfile, terpeneShortName } from '../../lib/compounds.js'
import { formatSchedule, money, pickVariant, sizeText, variantLabel } from '../../lib/format.js'
import { bySize } from '../../lib/sizes.js'
import { joinSlugId } from '../../../shared/slug.js'
import { NOT_FOR_PICKING } from '../picker/pickerModel.js'
import { WISHLIST_EVENT, WISHLIST_KEY } from '../../lib/wishlist.js'

const MAX_SIZES = 3
const CARD_TERPENES = 3
// Short labels; Total THC keeps its full name so it is never mistaken for plain THC.
const KNOWN_STRAINS = ['hybrid', 'sativa', 'indica']
// Size buttons are narrow: "3 × 0.5 g" is set as "3×0.5g" so it fits instead of being cut to "3 × 0…".
const compactSize = (text) => text.replace(/×/g, '×\u200b')

// Saved product ids live in this browser only; the API has no wishlist yet. Storage can be blocked, so every access is guarded.
function readWishlist() {
  try {
    const ids = JSON.parse(window.localStorage.getItem(WISHLIST_KEY) || '[]')
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

function writeWishlist(ids) {
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids))
  } catch {
    // Blocked or full storage: the heart still works for this visit.
  }
  window.dispatchEvent(new Event(WISHLIST_EVENT))
}

const inStock = (variant) => Number(variant?.stock?.quantity ?? 1) > 0

const BADGE_STYLES = { 'staff pick': 'badge-staff', new: 'badge-new', popular: 'badge-popular', sale: 'badge-sale' }

// `compounds` maps variant id → lab figures from the enrichment lookup; the catalog list itself carries them only for
// some products (edibles, drinks), so the card uses whichever has figures.
// `match` ({ percent, reasons }) is set on the product finder's results.
// "Total THC", "Total terpenes": the "Total" drops on phone cards (see .card-lab-total), where the label column is narrow.
function LabLabel({ label }) {
  const match = /^(Total )(.+)$/.exec(label)
  return match ? <><span className="card-lab-total">{match[1]}</span>{match[2]}</> : label
}

// The price in a size box, the same for one size or several: the price you pay, red when the product is on a deal of
// its own (`sale`). The old price is for screen readers only; the boxes are too narrow for both on phones, and the
// product page shows it.
function SizePrice({ prices, sale }) {
  const now = prices?.discounted ?? prices?.base
  const was = prices?.discounted != null && prices.discounted !== prices.base ? prices.base : null
  return (
    <strong className={`size-price${was != null && sale ? ' is-sale' : ''}`}>
      {money(now)}{was != null && <span className="sr-only">, was {money(was)}</span>}
    </strong>
  )
}

export function ProductCard({ product, category, brand, strain, effects, badge, compounds, deals, promotionNames = {}, storeWideIds = [], match, quantities = {}, busyKey, onChange }) {
  // Sizes smallest first, whatever order the store lists them in; the card starts on the first one in stock.
  const variants = useMemo(() => bySize(product?.variants), [product])
  const defaultIndex = Math.max(0, variants.indexOf(pickVariant({ variants })))
  const [pickedIndex, setPickedIndex] = useState(defaultIndex)
  const [saved, setSaved] = useState(() => readWishlist().includes(product.id))
  // Whether the Add to bag button had focus when pressed: the stepper that replaces it then takes the focus.
  const [addHadFocus, setAddHadFocus] = useState(false)

  const index = variants[pickedIndex] ? pickedIndex : defaultIndex
  const variant = variants[index]
  const purchaseKey = variant?.purchaseKey
  const available = Number(variant?.stock?.quantity ?? 1) > 0
  const quantity = quantities[purchaseKey] || 0
  const busy = busyKey === purchaseKey

  const href = import.meta.env.BASE_URL + 'p/' + joinSlugId(product.name, product.id)
  // A deal of the product's own. Store-wide promotions ("10% Off Everything") are said once, in the menu's banner, so a
  // price they lower stays in the normal colour and earns no Sale badge; a lowered price with no promotion behind it
  // (a price set by the store) counts as a sale. Until the deals have loaded, a store with a store-wide promotion shows
  // prices plain rather than red-then-plain. `storeWideIds` is null while the store-wide list is unknown (loading, or a
  // failed request): then only a lowered price with no promotion at all is red, and the deals row waits.
  const dealsOf = (option) => (Array.isArray(deals?.[String(option?.id)]) ? deals[String(option.id)] : [])
  const ownDeals = (option) => (storeWideIds ? dealsOf(option).filter((deal) => !storeWideIds.includes(String(deal.id))) : [])
  const onSale = (option) => {
    const prices = option?.prices
    if (prices?.discounted == null || prices.discounted === prices.base) return false
    if (!storeWideIds) return deals != null && dealsOf(option).length === 0
    if (!storeWideIds.length) return true
    return deals != null && (dealsOf(option).length === 0 || ownDeals(option).length > 0)
  }
  const autoSale = !badge && available && onSale(variant)
  const badgeText = badge || (autoSale ? 'Sale' : '')
  const strainName = strain ? String(strain) : ''
  const strainClass = KNOWN_STRAINS.includes(strainName.toLowerCase()) ? strainName.toLowerCase() : 'unknown'
  // Only the selected size's own figures: a lab result belongs to one size and batch, so another size's figures are
  // never shown in its place.
  // The lookup's figures come from the product detail and are complete; the list now carries only some of them (Total
  // Terpenes without THC), so it stands in only until the lookup answers, or when the lookup has none for that size.
  const figuresOf = (option) => {
    const looked = compounds?.[String(option?.id)]
    return hasFigures(looked) ? { compounds: looked } : option
  }
  const lab = figuresOf(variant)
  const potency = potencyOf(lab)
  // Fixed order, so the same figure sits in the same column on every card: Total THC, Terpenes, then CBD.
  const figures = [potency.thc, potency.terpenes, potency.cbd].filter(Boolean)
  // The strongest terpenes by name, isomers merged ("Pinene" once), each as a share of the total for the bar.
  const terpenes = []
  for (const item of terpeneProfile(lab)) {
    const name = terpeneShortName(item.label)
    if (terpenes.length < CARD_TERPENES && !terpenes.some((entry) => entry.name === name)) terpenes.push({ ...item, name })
  }
  const terpeneBase = potency.terpenes?.uom === terpenes[0]?.uom && potency.terpenes?.peak > 0 ? potency.terpenes.peak : terpenes.reduce((sum, item) => sum + item.peak, 0)
  const hasProfile = figures.length > 0 || terpenes.length > 0
  // Every card carries the same box: lab figures when there are some; otherwise one line in the lab-label style, "Lab
  // figures not listed" for cannabis or the category for anything else (a lighter, a gift card). Descriptions stay on
  // the product page.
  const fallbackLine = hasProfile ? '' : NOT_FOR_PICKING.test(category?.name || '') ? category?.name || '' : noFiguresNote(variant, variants, figuresOf)
  const shownEffects = (effects || []).slice(0, 3)
  // The selected size's own deals (from the enrichment lookup; the list carries no promotion ids), store-wide ones left
  // out: one on the card with "+1" for the rest; all of them are in the tooltip, for screen readers and on the product
  // page.
  const sizeDeals = ownDeals(variant).map((deal) => ({ ...deal, name: promotionNames[deal.id] || deal.name }))
  const sizes = variants.slice(0, MAX_SIZES)
  // Variants without a package can share a label ("Standard", "Lighter"). Shared labels say nothing, so those buttons
  // show just the price (a gift card's $50 and $100); only when the prices match too are they numbered, so the two
  // buttons still differ.
  const baseLabels = sizes.map((option) => compactSize(sizeText(option)) || variantLabel(product, option) || 'Standard')
  const priceOf = (option) => option?.prices?.discounted ?? option?.prices?.base
  const pricesDiffer = new Set(sizes.map(priceOf)).size === sizes.length
  const sizeLabels = baseLabels.map((label, position) => (baseLabels.indexOf(label) === baseLabels.lastIndexOf(label) ? label : pricesDiffer ? '' : `Option ${position + 1}`))
  const hiddenSizes = variants.length - sizes.length

  function toggleSaved() {
    const ids = readWishlist().filter((id) => id !== product.id)
    writeWishlist(saved ? ids : [...ids, product.id])
    setSaved(!saved)
  }

  return (
    <article className={`product-card ${available ? '' : 'is-sold-out'}`}>
      <div className="card-media">
        <a className="card-image-link" href={href} tabIndex={-1} aria-hidden="true">
          <ProductImage product={product} category={category} />
        </a>
        {badgeText && <span className={`badge ${BADGE_STYLES[badgeText.toLowerCase()] || ''}`}>{badgeText}</span>}
        <button className="wish-button" type="button" aria-label={`Save ${product.name}`} aria-pressed={saved} title={saved ? 'Saved' : 'Save'} onClick={toggleSaved}>
          <Heart size={18} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
        {strainName && <span className={`strain-pill is-${strainClass}`}>{strainName}</span>}
      </div>

      <div className="card-body">
        {match && (match.percent != null || match.reasons?.length > 0) && (
          <p className="card-match">
            {match.percent != null && <strong>{match.percent}% match</strong>}
            {match.reasons?.length > 0 && <span>{match.reasons.join(' · ')}</span>}
          </p>
        )}
        <h3 className="card-title" title={product.name}><a href={href}>{product.name}</a></h3>
        {brand && <p className="card-brand">{brand}</p>}
        {hasProfile && (
          <div className="card-lab">
            {figures.length > 0 && (
              <dl className="card-lab-stats">
                {figures.map((item) => (
                  <div className={`card-lab-stat is-${item.kind}`} key={item.kind} title={item.calculated ? `${item.label}, calculated from the lab figures` : undefined}>
                    <dt><LabLabel label={item.label} /></dt>
                    <dd>{item.text}</dd>
                  </div>
                ))}
              </dl>
            )}
            {terpenes.length > 0 && (
              <div className="card-terps">
                <span className="card-terp-bar" aria-hidden="true">
                  {terpenes.map((item, position) => (
                    <span key={item.name} className={`card-terp-seg is-${position + 1}`} style={{ width: `${Math.max(4, Math.min(100, (item.peak / terpeneBase) * 100))}%` }} />
                  ))}
                </span>
                <span className="card-terp-names">{terpenes.map((item) => item.name).join(' · ')}</span>
              </div>
            )}
          </div>
        )}
        {fallbackLine && <div className="card-lab is-fallback"><p className="card-lab-note">{fallbackLine}</p></div>}
        {shownEffects.length > 0 && (
          <ul className="effect-chips" aria-label="Effects">
            {shownEffects.map((effect) => <li className="effect-chip" key={effect}>{effect}</li>)}
          </ul>
        )}

        {sizeDeals.length > 0 && (
          <p className="card-deal" title={sizeDeals.map((deal) => (deal.schedule ? `${deal.name}: ${formatSchedule(deal.schedule)}` : deal.name)).join('\n')}>
            <span className="sr-only">Deals: {sizeDeals.map((deal) => deal.name).join(', ')}</span>
            <span className="card-deal-name" aria-hidden="true">{sizeDeals[0].name}</span>
            {sizeDeals.length > 1 && <span className="card-deal-more" aria-hidden="true">+{sizeDeals.length - 1}</span>}
          </p>
        )}
        {variants.length === 1 && (
          // One size: the same box as a picked size among several, so every card reads size, then price. Only a real
          // size ("100 mg", "2 pack") is worth a label; the store's variant names repeat the product and its type
          // ("Kalo Bubbler Accessory"), so without a size the box holds just the price.
          <div className="size-single">
            {sizeText(variant) && <span className="size-label">{sizeText(variant)}</span>}
            <SizePrice prices={variant?.prices} sale={onSale(variant)} />
          </div>
        )}
        {variants.length > 1 && (
          // Long labels (packs like "14×0.5g") get two sizes per line instead of three; the longest ("16×3.125mg") may
          // also break after the "×", so none is cut to "14×0…".
          <div className={`size-options${sizeLabels.some((label) => label.length > 8) ? ' has-long-labels has-longest-labels' : sizeLabels.some((label) => label.length > 5) ? ' has-long-labels' : ''}`} role="group" aria-label={`Size for ${product.name}`}>
            {sizes.map((option, position) => (
              <button
                key={option.purchaseKey || position}
                className="size-option"
                type="button"
                aria-pressed={position === index}
                disabled={!inStock(option)}
                title={inStock(option) ? undefined : 'Sold out'}
                onClick={() => setPickedIndex(position)}
              >
                {sizeLabels[position] && <span className="size-label" title={sizeText(option) || undefined}>{sizeLabels[position]}</span>}
                <SizePrice prices={option?.prices} sale={onSale(option)} />
              </button>
            ))}
            {hiddenSizes > 0 && <a className="size-more" href={href}>+{hiddenSizes} more</a>}
          </div>
        )}

        <div className="card-cart">
          {!available ? (
            <button className="add-button" type="button" disabled>Sold out</button>
          ) : quantity > 0 ? (
            <QuantityStepper quantity={quantity} busy={busy} name={product.name} focusPlus={addHadFocus} onChange={(delta) => onChange(purchaseKey, delta, product.name)} />
          ) : (
            <button className="add-button" type="button" disabled={busy || !purchaseKey} onClick={(event) => { setAddHadFocus(document.activeElement === event.currentTarget); onChange(purchaseKey, 1, product.name) }} aria-label={`Add to bag: ${product.name}`}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
              {/* The accessible name starts with this visible label ("Add to bag: Product"), as WCAG label-in-name asks. */}
              <span>Add to bag</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
