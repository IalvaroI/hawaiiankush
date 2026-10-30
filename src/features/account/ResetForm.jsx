import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { CodeField } from './CodeField.jsx'
import { NewPasswordField } from './NewPasswordField.jsx'
import { failureText, isValidOtp, passwordValid } from './accountRules.js'
import { Alert } from './AccountFrame.jsx'

// A code from the email plus a new password. Used for a forgotten password (sign-in) and for setting or changing one
// (account). The parent sends the first code and spends the code in onSubmit; this form owns resend and its messages.
export function ResetForm({ idPrefix, email, initialResendAt, onResend, onSubmit, onBack, submitLabel }) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [resendAt, setResendAt] = useState(initialResendAt)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function resend() {
    setMessage('')
    try {
      setResendAt(await onResend())
    } catch (error) {
      setMessage(failureText(error, "We couldn't send a new code. Try again in a moment."))
    }
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!isValidOtp(code)) next.code = 'Enter the verification code we emailed you.'
    if (!passwordValid(password)) next.password = 'Choose a password that meets every requirement.'
    setErrors(next)
    setMessage('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await onSubmit(code, password)
    } catch (error) {
      setMessage(error?.status === 400 ? "That code didn't work. Check it or request a new one." : failureText(error, "We couldn't set your password. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      {message && <Alert>{message}</Alert>}
      <CodeField id={`${idPrefix}-code`} value={code} onChange={setCode} resendAt={resendAt} onResend={resend} error={errors.code} sentTo={email} />
      <NewPasswordField id={`${idPrefix}-password`} label="New password" value={password} onChange={setPassword} error={errors.password} />
      <button className="primary-button wide" type="submit" disabled={busy}>
        {busy && <Loader2 className="spin" size={18} aria-hidden="true" />}
        {submitLabel}
      </button>
      <div className="acct-links">
        <button type="button" className="text-button" onClick={onBack} disabled={busy}>Back</button>
      </div>
    </form>
  )
}
