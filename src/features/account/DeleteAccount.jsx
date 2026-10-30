import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { deleteUser, emailContact, sendOtp } from './accountApi.js'
import { CodeField } from './CodeField.jsx'
import { Alert } from './AccountFrame.jsx'
import { failureText, isValidOtp } from './accountRules.js'

// Two steps, both explicit: "Delete account" emails a code to the account address, then the code and a second button
// delete it. The DELETE itself is answered with no body; the caller signs the browser out afterwards.
export function DeleteAccount({ userId, email, onDeleted }) {
  const [stage, setStage] = useState('idle')
  const [code, setCode] = useState('')
  const [resendAt, setResendAt] = useState('')
  const [error, setError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendCode() {
    setError('')
    setStage('sending')
    try {
      const { expiresAt } = await sendOtp(emailContact(email), 'authorization')
      setResendAt(expiresAt)
      setCode('')
      setStage('confirm')
    } catch (err) {
      setError(failureText(err, "We couldn't send a code. Try again."))
      setStage('idle')
    }
  }

  async function resend() {
    try {
      const { expiresAt } = await sendOtp(emailContact(email), 'authorization')
      setResendAt(expiresAt)
      setCodeError('')
    } catch (err) {
      setCodeError(failureText(err, "We couldn't send a new code. Try again in a moment."))
    }
  }

  async function remove(event) {
    event.preventDefault()
    if (!isValidOtp(code)) {
      setCodeError('Enter the verification code we emailed you.')
      return
    }
    setCodeError('')
    setError('')
    setBusy(true)
    try {
      await deleteUser(userId, code)
      onDeleted()
    } catch (err) {
      setBusy(false)
      if (err?.status === 400) setCodeError("That code didn't work. Check it or request a new one.")
      else setError(failureText(err, "We couldn't delete your account. Try again."))
    }
  }

  return (
    <>
      <h2 id="acct-delete">Delete account</h2>
      <p className="acct-muted">Deleting your account is permanent and cannot be undone. It removes the account and signs you out on this device.</p>
      {error && <Alert>{error}</Alert>}
      {stage !== 'confirm' && (
        <div className="acct-actions">
          <button className="danger-button" type="button" onClick={sendCode} disabled={stage === 'sending'}>
            {stage === 'sending' && <Loader2 className="spin" size={16} aria-hidden="true" />}
            {stage === 'sending' ? 'Sending code...' : 'Delete account'}
          </button>
        </div>
      )}
      {stage === 'confirm' && (
        <form className="acct-form" onSubmit={remove} noValidate>
          <p className="acct-muted">We sent a code to <strong>{email}</strong>. Enter it to confirm.</p>
          <CodeField id="delete-code" value={code} onChange={setCode} resendAt={resendAt} onResend={resend} error={codeError} />
          <div className="acct-actions">
            <button className="danger-button" type="submit" disabled={busy}>
              {busy && <Loader2 className="spin" size={16} aria-hidden="true" />}
              Delete my account
            </button>
            <button className="text-button" type="button" onClick={() => setStage('idle')} disabled={busy}>Keep my account</button>
          </div>
        </form>
      )}
    </>
  )
}
