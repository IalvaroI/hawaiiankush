import { useEffect, useMemo, useState } from 'react'
import { Mail, MapPin, Navigation, Phone } from 'lucide-react'
import { api } from '../api/client.js'
import { DEMO_MODE, STORE_ID } from '../config.js'
import { useCart } from '../layout/CartContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useContent } from '../lib/content.js'
import { SiteImage } from '../ui/SiteImage.jsx'
import './pages.css'
import { NotConnected } from '../ui/NotConnected.jsx'
import { errorText } from '../lib/errors.js'
import { cleanText } from '../lib/format.js'

// The API sends numbers as strings in places; anything that is not a number is NaN, which hides the UI that needs it.
const toNumber = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value))

// Nearest first; a store with no distance goes last.
function byDistance(a, b) {
  const da = Number.isFinite(a.distance) ? a.distance : Infinity
  const db = Number.isFinite(b.distance) ? b.distance : Infinity
  if (da === db) return 0
  return da < db ? -1 : 1
}

// Locations: this store's card with directions, then every store of the chain by distance.
export function LocationsPage() {
  const { store } = useCart()
  const connected = !DEMO_MODE && Boolean(STORE_ID)
  const address = cleanText(store?.contacts?.address)
  const phone = cleanText(store?.contacts?.phone)
  const email = cleanText(store?.contacts?.email)
  const description = cleanText(store?.description)
  const latitude = toNumber(store?.location?.coordinates?.latitude)
  const longitude = toNumber(store?.location?.coordinates?.longitude)
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
  // The chain list is measured from this store's position and address, so it needs both.
  const canList = connected && Boolean(store?.id) && hasCoordinates && Boolean(address)

  const [chain, setChain] = useState(null)
  const [chainError, setChainError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // The app shell fetches the store and keeps quiet when that fails; after a while this page says so instead of loading forever.
  const [storeSlow, setStoreSlow] = useState(false)

  useEffect(() => {
    if (store) return undefined
    const timer = window.setTimeout(() => setStoreSlow(true), 8000)
    return () => window.clearTimeout(timer)
  }, [store])

  useEffect(() => {
    if (!canList) return undefined
    let active = true
    setChain(null)
    setChainError('')
    const query = new URLSearchParams({
      'Location.Address': address,
      'Location.Coordinates.Latitude': String(latitude),
      'Location.Coordinates.Longitude': String(longitude),
    })
    api(`/stores-by-location?${query}`)
      .then((result) => { if (active) setChain(Array.isArray(result?.stores) ? result.stores : []) })
      .catch((err) => { if (active) setChainError(errorText(err, 'Other locations could not be loaded.')) })
    return () => { active = false }
  }, [canList, address, latitude, longitude, attempt])

  // Until the store is known the server's title stays.
  usePageTitle(store?.name ? `Locations · ${store.name}` : '')
  const { locations } = useContent()

  const rows = useMemo(() => (chain || [])
    .filter((entry) => entry?.id)
    .map((entry) => ({ ...entry, distance: toNumber(entry.distanceInMiles) }))
    .sort(byDistance), [chain])

  if (!connected) {
    return (
      <div className="sheet page">
        <header className="page-head"><h1 className="page-title">Locations</h1></header>
        <NotConnected icon={MapPin} title="Locations aren’t available right now" />
      </div>
    )
  }

  const directions = hasCoordinates ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : ''

  return (
    <div className="sheet page">
      <SiteImage className="page-banner" image={locations?.image} sizes="(max-width: 899px) 100vw, 900px" priority />
      <header className="page-head">
        <h1 className="page-title">Locations</h1>
      </header>
      {!store ? (
        storeSlow ? (
          <div className="state-panel" role="alert">
            <MapPin size={28} aria-hidden="true" />
            <h2>Store details didn’t load</h2>
            <p>Refresh the page to try again.</p>
          </div>
        ) : (
          <div className="store-card" aria-busy="true">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-wide" />
          </div>
        )
      ) : (
        <div className={`locations${canList ? ' has-list' : ''}`}>
          <section className="store-card" aria-labelledby="store-name">
            <h2 id="store-name" className="store-card-name">{store.name}</h2>
            {description && <p className="store-card-desc">{description}</p>}
            {(address || phone || email) && (
              <ul className="store-facts">
                {address && <li><MapPin size={18} aria-hidden="true" /><span>{address}</span></li>}
                {phone && <li><Phone size={18} aria-hidden="true" /><a href={`tel:${phone}`}>{phone}</a></li>}
                {email && <li><Mail size={18} aria-hidden="true" /><a href={`mailto:${email}`}>{email}</a></li>}
              </ul>
            )}
            {directions && (
              <a className="primary-button" href={directions} target="_blank" rel="noopener noreferrer">
                <Navigation size={18} aria-hidden="true" /> Get directions <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </section>

          {canList && (
            <section className="chain" aria-labelledby="chain-title">
              <h2 id="chain-title">All locations</h2>
              <p className="page-note">Nearest first, measured from this store.</p>
              {chainError ? (
                <div className="state-panel" role="alert">
                  <h2>Other locations didn’t load</h2>
                  <p>{chainError}</p>
                  <button className="primary-button" type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
                </div>
              ) : chain === null ? (
                <div className="store-list" aria-hidden="true"><div className="list-skeleton" /><div className="list-skeleton" /></div>
              ) : (
                <ul className="store-list">
                  {rows.map((row) => {
                    const current = row.id === store.id
                    return (
                      <li className={`store-row${current ? ' is-current' : ''}`} key={row.id}>
                        <h3 className="store-row-name">{row.name}</h3>
                        <div className="store-row-meta">
                          {current
                            ? <span className="here-pill">You're here</span>
                            : Number.isFinite(row.distance) && <span className="distance">{row.distance.toFixed(1)} mi</span>}
                          {row.options?.pickup?.enabled && <span className="option-pill">Pickup</span>}
                          {row.options?.delivery?.enabled && <span className="option-pill">Delivery</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
