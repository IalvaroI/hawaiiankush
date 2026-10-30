import { useEffect, useState } from 'react'
import { Car, CarFront, LocateFixed, Loader2, MapPin, Store, Truck } from 'lucide-react'
import { cleanText, money, readable } from '../../lib/format.js'
import { StepShell } from './StepShell.jsx'
import { FULFILLMENT, addressText, fulfillmentLabel, windowRange } from './checkoutDraft.js'
import { useDeliveryCheck } from './useDeliveryCheck.js'

const ICONS = { inStorePickup: Store, curbside: Car, driveThrough: CarFront, delivery: Truck }
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_NAMES = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }

// What the store says about delivery to the typed address: the fee, the minimum, the free-delivery threshold and the
// weekly schedule. Only shown when the store reaches the address.
function DeliveryTerms({ terms }) {
  const policy = terms?.policy || {}
  const schedule = [...(terms?.schedule || [])].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek))
  const days = DAY_ORDER.filter((day) => schedule.some((entry) => entry.dayOfWeek === day))
  const facts = [
    Number(policy.fee) > 0 ? `Delivery fee ${money(policy.fee)}` : 'No delivery fee',
    Number(policy.amountForMinOrder) > 0 ? `Minimum order ${money(policy.amountForMinOrder)}` : '',
    policy.amountForFreeDelivery != null && policy.amountForFreeDelivery !== '' ? `Free delivery on orders of ${money(policy.amountForFreeDelivery)} or more` : '',
  ].filter(Boolean)
  return (
    <div className="co-notice is-good" role="status">
      <strong>We deliver to this address.</strong>
      <ul className="co-facts">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
      {days.length > 0 && (
        <ul className="co-schedule" aria-label="Delivery hours">
          {days.map((day) => (
            <li key={day}><span>{DAY_NAMES[day]}</span><span>{schedule.filter((entry) => entry.dayOfWeek === day).map((entry) => windowRange(entry.interval)).join(', ')}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeliveryVerdict({ ready, checking, verdict, onRetry, onPickup }) {
  if (!ready) return <p className="co-hint">Enter your address and share your location, and we’ll check that we deliver there.</p>
  if (checking || !verdict) return <p className="co-hint" role="status"><Loader2 className="spin" size={16} aria-hidden="true" /> Checking delivery to this address…</p>
  if (verdict.status === 'available') return <DeliveryTerms terms={verdict.terms} />
  if (verdict.status === 'notAllowed' || verdict.status === 'outOfZone') {
    return (
      <div className="co-alert" role="alert">
        <p>We don’t deliver to this address yet.</p>
        {onPickup && <button type="button" className="secondary-button" onClick={onPickup}>Pick up instead</button>}
      </div>
    )
  }
  return (
    <div className="co-alert" role="alert">
      <p>We couldn’t check delivery to this address just now.</p>
      <button type="button" className="secondary-button" onClick={onRetry}>Try again</button>
    </div>
  )
}

export function FulfillmentStep({ number, open, done, draft, updateDraft, choices, store, pickupReadyText, busy, error, onContinue, onPickupInstead, onEdit }) {
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const delivering = draft.choice === 'delivery'
  const check = useDeliveryCheck({ address: draft.address, secondaryAddress: draft.secondaryAddress, coordinates: draft.coordinates, enabled: open && delivering })
  const verdict = check.verdict
  // A store that sells no delivery at all hides the option instead of offering one it cannot fill.
  const deliveryOff = verdict?.status === 'disabled'
  const visible = choices.filter((choice) => !(choice === 'delivery' && deliveryOff))
  const pickupChoice = visible.find((choice) => choice !== 'delivery')
  const storeAddress = cleanText(store?.contacts?.address)
  const storeLine = storeAddress || cleanText(store?.name) || 'the store'
  const canContinue = Boolean(draft.choice) && visible.includes(draft.choice) && (!delivering || verdict?.status === 'available')

  useEffect(() => {
    if (deliveryOff && draft.choice === 'delivery') updateDraft({ choice: '' })
  }, [deliveryOff, draft.choice, updateDraft])

  function locate() {
    if (!navigator.geolocation) {
      setLocationError('This browser can’t share your location. Type your address and we’ll check it another way.')
      return
    }
    setLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateDraft({ coordinates: { latitude: position.coords.latitude, longitude: position.coords.longitude } })
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocationError('We couldn’t get your location. Allow location access and try again.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const summary = done
    ? (delivering ? `Delivery to ${addressText(draft)}` : `${fulfillmentLabel(draft.choice)} · ${storeLine}`)
    : ''

  return (
    <StepShell id="fulfillment" number={number} title="Pickup or delivery" summary={summary} open={open} done={done} onEdit={onEdit}>
      {visible.length === 0 ? (
        <p className="co-notice" role="status">Pickup and delivery aren’t available right now.</p>
      ) : (
        <fieldset className="co-options">
          <legend>How would you like your order?</legend>
          {visible.map((value) => {
            const meta = FULFILLMENT[value] || { label: readable(value), hint: '' }
            const Icon = ICONS[value] || Store
            const selected = draft.choice === value
            return (
              <label key={value} className={`co-option${selected ? ' is-selected' : ''}`}>
                <input type="radio" name="co-fulfillment" value={value} checked={selected} onChange={() => updateDraft({ choice: value })} />
                <Icon size={20} aria-hidden="true" className="co-option-icon" />
                <span className="co-option-text"><strong>{meta.label}</strong>{meta.hint && <small>{meta.hint}</small>}</span>
              </label>
            )
          })}
        </fieldset>
      )}

      {draft.choice && !delivering && (
        <p className="co-notice"><MapPin size={16} aria-hidden="true" /> Pick up at {storeLine}{pickupReadyText ? ` · ${pickupReadyText}` : ''}</p>
      )}

      {delivering && (
        <div className="co-delivery">
          <div className="co-fields">
            <div className="field co-wide">
              <label htmlFor="co-address">Delivery address</label>
              <input id="co-address" autoComplete="street-address" value={draft.address} onChange={(event) => updateDraft({ address: event.target.value })} />
            </div>
            <div className="field co-wide">
              <label htmlFor="co-apartment">Apartment, suite or floor <small>Optional</small></label>
              <input id="co-apartment" autoComplete="address-line2" value={draft.secondaryAddress} onChange={(event) => updateDraft({ secondaryAddress: event.target.value })} />
            </div>
          </div>
          <div className="co-locate">
            <button type="button" className="secondary-button" onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
              Use my current location
            </button>
            <span>{draft.coordinates ? 'Location saved.' : 'We need your location to check delivery.'}</span>
          </div>
          {locationError && <p className="co-alert" role="alert">{locationError}</p>}
          <DeliveryVerdict
            ready={check.ready}
            checking={check.checking}
            verdict={verdict}
            onRetry={check.retry}
            onPickup={pickupChoice ? () => onPickupInstead(pickupChoice) : null}
          />
        </div>
      )}

      {error && <p className="co-alert" role="alert">{error}</p>}
      {visible.length > 0 && (
        <>
          <button className="primary-button wide" type="button" disabled={busy !== '' || !canContinue} onClick={onContinue}>
            {busy === 'fulfillment' && <Loader2 className="spin" size={18} aria-hidden="true" />} Continue
          </button>
          {!canContinue && <p className="co-hint">{delivering ? 'Check that we deliver to this address to continue.' : 'Choose how you would like to get your order.'}</p>}
        </>
      )}
    </StepShell>
  )
}
