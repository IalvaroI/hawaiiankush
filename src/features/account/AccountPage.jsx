import './account.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useCart } from '../../layout/CartContext.jsx'
import { AccountFrame, Alert } from './AccountFrame.jsx'
import { getSettings, getUser } from './accountApi.js'
import { DeleteAccount } from './DeleteAccount.jsx'
import { NotificationsSection } from './NotificationsSection.jsx'
import { PasswordSection } from './PasswordSection.jsx'
import { failureText, formatBirthDate } from './accountRules.js'
import { useSession } from './useSession.js'

const VERIFICATION = {
  verified: ['Verified', 'acct-badge-verified'],
  unverified: ['Not verified', 'acct-badge-unverified'],
  unnecessary: ['No check needed', 'acct-badge-none'],
}

function Row({ label, value }) {
  return (
    <div className="acct-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// Signed-out visitors are sent to sign-in and brought back here. `leaving` covers sign-out and account deletion, so the
// redirect does not fight the message and the navigation that follow them.
export function AccountPage() {
  const { session, loading, error, refresh, signOut } = useSession()
  const { flash, resetCart } = useCart()
  const navigate = useNavigate()
  const leaving = useRef(false)

  async function signOutNow() {
    leaving.current = true
    try {
      await signOut()
      // The bag on this device was the account's cart; signed out, the next add starts a fresh guest bag.
      resetCart()
      flash('Signed out')
      navigate('/', { replace: true })
    } catch {
      leaving.current = false
      flash("We couldn't sign you out. Try again.", 'error')
    }
  }

  // Deleting clears nothing in the browser by itself, so the session is signed out right after the DELETE.
  function accountDeleted() {
    leaving.current = true
    signOut().then(
      () => {
        resetCart()
        flash('Account deleted')
        navigate('/', { replace: true })
      },
      () => {
        leaving.current = false
        flash('Your account was deleted, but this browser is still signed in. Sign out to finish.', 'error')
      },
    )
  }

  if (!session) {
    return (
      <AccountFrame narrow card title="Your account">
        {loading ? <p className="acct-muted">Loading…</p> : (
          <>
            <Alert>{error}</Alert>
            <div className="acct-actions">
              <button className="primary-button" type="button" onClick={() => refresh()}>Try again</button>
            </div>
          </>
        )}
      </AccountFrame>
    )
  }
  if (leaving.current) return <AccountFrame narrow card><p className="acct-muted">Signing out...</p></AccountFrame>
  if (!session.signedIn) return <Navigate to={`/sign-in?next=${encodeURIComponent('/account')}`} replace />

  return <AccountDetails userId={session.userId} onSignOut={signOutNow} onDeleted={accountDeleted} onSessionEnded={refresh} />
}

function AccountDetails({ userId, onSignOut, onDeleted, onSessionEnded }) {
  const [user, setUser] = useState(null)
  // undefined while loading, null when the settings could not be loaded.
  const [settings, setSettings] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profile, prefs] = await Promise.all([getUser(userId), getSettings(userId).then((result) => result.settings, () => null)])
      setUser(profile.user)
      setSettings(prefs)
    } catch (err) {
      // 401 means the session has ended on the server; the session check then sends the visitor to sign in.
      if (err?.status === 401) onSessionEnded()
      else setError(failureText(err, "Your account couldn't be loaded. Try again."))
    } finally {
      setLoading(false)
    }
  }, [userId, onSessionEnded])

  useEffect(() => {
    load()
  }, [load])

  if (!user) {
    return (
      <AccountFrame narrow card title="Your account">
        {loading ? <p className="acct-muted">Loading…</p> : (
          <>
            <Alert>{error}</Alert>
            <div className="acct-actions">
              <button className="primary-button" type="button" onClick={load}>Try again</button>
            </div>
          </>
        )}
      </AccountFrame>
    )
  }

  const name = [user.name?.firstName, user.name?.lastName].filter(Boolean).join(' ')
  const email = user.login?.value || ''
  const contacts = user.contacts || []

  return (
    <AccountFrame
      eyebrow={name ? 'Your account' : undefined}
      title={name || 'Your account'}
      actions={<button className="secondary-button" type="button" onClick={onSignOut}>Sign out</button>}
    >
      {error && <Alert>{error}</Alert>}
      <div className="acct-grid">
        <section className="acct-card" aria-labelledby="acct-profile">
          <h2 id="acct-profile">Profile</h2>
          <dl className="acct-rows">
            <Row label="Name" value={name || 'Not added'} />
            <Row label="Date of birth" value={user.birthDate ? formatBirthDate(user.birthDate) : 'Not added'} />
            <Row label="Sign-in email" value={email || 'Not added'} />
          </dl>
          {contacts.length > 0 && (
            <>
              <h3>Contact details</h3>
              <ul className="acct-contacts">
                {contacts.map((contact) => {
                  const [text, tone] = VERIFICATION[contact.verificationStatus] || VERIFICATION.unnecessary
                  return (
                    <li key={`${contact.type}-${contact.value}`}>
                      <span>{contact.type === 'phone' ? 'Phone' : 'Email'}</span>
                      <strong>{contact.value}</strong>
                      <span className={`acct-badge ${tone}`}>{text}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <p className="acct-muted">To change these details, contact the store.</p>
        </section>

        <section className="acct-card" aria-labelledby="acct-password">
          <PasswordSection user={user} onChanged={load} />
        </section>

        <section className="acct-card" aria-labelledby="acct-notify">
          <NotificationsSection settings={settings} />
        </section>

        <section className="acct-card" aria-labelledby="acct-orders">
          <h2 id="acct-orders">Orders</h2>
          <p className="acct-muted">Your order history, with status and receipts.</p>
          <div className="acct-actions">
            <Link className="secondary-button" to="/orders">Order history</Link>
          </div>
        </section>

        <section className="acct-card acct-danger" aria-labelledby="acct-delete">
          <DeleteAccount userId={userId} email={email} onDeleted={onDeleted} />
        </section>
      </div>
    </AccountFrame>
  )
}
