import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '../../api/client.js'
import { SALE_TYPE, setSaleType } from '../../config.js'
import { storageGet, storageSet } from '../../lib/storage.js'
import { useCart } from '../../layout/CartContext.jsx'
import './compliance.css'

// [value, label, short label for phones]
const OPTIONS = [['recreational', 'Recreational', 'Rec'], ['medical', 'Medical', 'Med']]
const NOTICE_KEY = 'medical-notice-dismissed'
const labelOf = (type) => OPTIONS.find(([value]) => value === type)?.[1] || type

// Shown only when the store sells both sale types.
export function canSwitchSaleType(store) {
  const types = store?.saleTypes || []
  return types.includes('medical') && types.includes('recreational')
}

// Recreational | Medical. Switching saves the choice on this device, updates the open cart (PUT settings), then
// reloads so every page refetches with the new scope. With items in the bag it asks first, because prices and stock
// differ.
export function SaleTypeSwitch() {
  const { cartId, cart, cartCount, flash } = useCart()
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef(null)
  const confirmRef = useRef(null)

  // Focus moves to the confirm button when the popover opens; a click outside or Escape cancels it.
  useEffect(() => {
    if (!pending) return undefined
    confirmRef.current?.focus()
    function onPointer(event) {
      if (!wrapRef.current?.contains(event.target)) setPending(null)
    }
    function onKey(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPending(null)
      wrapRef.current?.querySelector('[aria-pressed="true"]')?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [pending])

  function choose(type) {
    if (type === SALE_TYPE || busy) return
    if (cartCount > 0) setPending(type)
    else switchTo(type)
  }

  async function switchTo(type) {
    const previous = SALE_TYPE
    setBusy(true)
    // The choice is saved on this device first: if that fails, nothing has changed yet. If the cart update then
    // fails, the saved choice is put back, so the page, the cart and the bag still agree.
    if (!setSaleType(type)) {
      setBusy(false)
      setPending(null)
      flash('Could not save your choice on this device. Try again.', 'error')
      return
    }
    if (cartId) {
      try {
        await api(`/carts/${encodeURIComponent(cartId)}/settings`, {
          method: 'PUT',
          // Keep the shopper's residency claim; only the sale type changes.
          body: JSON.stringify({ settings: { saleType: type, isResident: Boolean(cart?.settings?.isResident) } }),
        })
      } catch {
        setSaleType(previous)
        setBusy(false)
        setPending(null)
        flash(`Could not switch to ${labelOf(type).toLowerCase()} prices. Your bag was not changed.`, 'error')
        return
      }
    }
    // Stays busy until the reload replaces the page, so a second click cannot race it.
    window.location.reload()
  }

  return (
    <div className="sale-switch" ref={wrapRef}>
      <div className="sale-segments" role="group" aria-label="Sale type" aria-busy={busy || undefined}>
        {OPTIONS.map(([value, label, short]) => (
          <button
            key={value}
            type="button"
            className="sale-segment"
            aria-label={label}
            aria-pressed={SALE_TYPE === value}
            disabled={busy}
            onClick={() => choose(value)}
          >
            <span className="sale-label-full" aria-hidden="true">{label}</span>
            <span className="sale-label-short" aria-hidden="true">{short}</span>
          </button>
        ))}
      </div>
      {pending && (
        <div className="sale-confirm" role="dialog" aria-modal="false" aria-labelledby="sale-confirm-text">
          <p id="sale-confirm-text">
            Switch to {labelOf(pending).toLowerCase()} prices? Prices and stock differ, so items in your bag may change price or
            become unavailable.{pending === 'medical' && ' A valid medical cannabis ID is required at pickup.'}
          </p>
          <div className="sale-confirm-actions">
            <button ref={confirmRef} type="button" className="primary-button" disabled={busy} aria-busy={busy || undefined} onClick={() => switchTo(pending)}>
              {busy ? <><Loader2 className="spin" size={16} aria-hidden="true" /> Switching…</> : 'Switch'}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); wrapRef.current?.querySelector('[aria-pressed="true"]')?.focus() }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// One-time note under the top bar while medical prices are shown. Dismissal is remembered on this device.
export function MedicalNotice() {
  const [dismissed, setDismissed] = useState(() => storageGet(NOTICE_KEY) === '1')
  if (dismissed) return null
  return (
    <div className="medical-notice" role="note">
      <p>Medical prices shown. A valid medical cannabis ID is required at pickup.</p>
      <button
        type="button"
        className="text-button"
        onClick={() => { storageSet(NOTICE_KEY, '1'); setDismissed(true) }}
      >
        Got it
      </button>
    </div>
  )
}
