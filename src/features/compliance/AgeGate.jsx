import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../../layout/CartContext.jsx'
import { useDialog } from '../../hooks/useDialog.js'
import { storageGet, storageSet } from '../../lib/storage.js'
import './compliance.css'

const AGE_KEY = 'age-verified'
const noop = () => {}

// Remembered for this page even when localStorage is blocked (private windows, cleared site data).
let verifiedThisSession = false

function isVerified() {
  return verifiedThisSession || Boolean(storageGet(AGE_KEY))
}

function rememberVerified() {
  verifiedThisSession = true
  storageSet(AGE_KEY, new Date().toISOString().slice(0, 10))
}

// First-visit 21+ gate. It is a modal over the whole shop: it renders into <body> (outside #root, which is made inert
// while it is open), Escape does not close it, and focus stays inside it (useDialog).
//
// Development only: `?age=21` in the URL counts as "Yes" once (the parameter is then removed). Production builds ignore it,
// so a shared link cannot skip the question; tests pass the gate through storage instead.
const AGE_SHORTCUT = import.meta.env.DEV
export function AgeGate() {
  const { store } = useCart()
  const location = useLocation()
  const navigate = useNavigate()
  const [verified, setVerified] = useState(() => {
    if (isVerified()) return true
    if (AGE_SHORTCUT && new URLSearchParams(location.search).get('age') === '21') {
      rememberVerified()
      return true
    }
    return false
  })
  const [refused, setRefused] = useState(false)
  const ref = useRef(null)
  const leaveRef = useRef(null)
  const open = !verified

  // Declared before useDialog so its cleanup (which returns focus) runs after #root is made active again.
  useEffect(() => {
    if (!open) return undefined
    const root = document.getElementById('root')
    if (root) root.inert = true
    return () => { if (root) root.inert = false }
  }, [open])

  useDialog(open, noop, ref)

  // `?age=21` arriving after the gate is already open (an in-app link) is honoured too, then removed from the URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!AGE_SHORTCUT || params.get('age') !== '21') return
    rememberVerified()
    setVerified(true)
    params.delete('age')
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true })
  }, [location.search, location.pathname, location.hash, navigate])

  useEffect(() => {
    if (refused) leaveRef.current?.focus()
  }, [refused])

  if (!open) return null

  function confirm() {
    rememberVerified()
    setVerified(true)
  }

  return createPortal(
    <div className="age-gate-backdrop">
      <section ref={ref} className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title" aria-describedby={refused ? undefined : 'age-gate-copy'}>
        {store?.settings?.images?.logo && <img className="age-gate-logo" src={store.settings.images.logo} alt="" />}
        {store?.name && <p className="age-gate-name">{store.name}</p>}
        {refused ? (
          <>
            <h2 id="age-gate-title" className="age-gate-title">Sorry, you must be of legal age to enter.</h2>
            <a ref={leaveRef} className="secondary-button age-gate-leave" href="https://www.google.com">Go to google.com</a>
          </>
        ) : (
          <>
            <h2 id="age-gate-title" className="age-gate-title">Are you 21 or older?</h2>
            <p id="age-gate-copy" className="age-gate-copy">You must be 21+ (or a registered medical patient) to view this site.</p>
            <div className="age-gate-actions">
              <button type="button" className="primary-button" onClick={confirm}>Yes, I&apos;m 21 or older</button>
              <button type="button" className="secondary-button" onClick={() => setRefused(true)}>No, I’m under 21</button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}
