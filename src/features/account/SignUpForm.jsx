import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createUser, sendOtp } from './accountApi.js'
import { CodeField } from './CodeField.jsx'
import { NewPasswordField } from './NewPasswordField.jsx'
import { TextField } from './Field.jsx'
import { Alert } from './AccountFrame.jsx'
import { latestBirthDateFor21 } from '../../lib/format.js'
import { birthDateError, failureText, isValidOtp, isValidPhone, passwordValid, phoneDigits } from './accountRules.js'

// Sign-up after a registration token: the email is already confirmed by its code, so the form asks for the profile.
// Phone is optional; "Verify by text" sends a code, and a correct code is sent with the phone so it is stored verified.
// A wrong code makes the whole create fail (the API changes nothing), so the code field explains that.
export function SignUpForm({ medical, onDone, onExpired, onStartOver }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', birthDate: '', medicalId: '', password: '' })
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneCodeFor, setPhoneCodeFor] = useState('')
  const [phoneResendAt, setPhoneResendAt] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const digits = phoneDigits(phone)
  const codeSent = Boolean(digits) && phoneCodeFor === digits
  const field = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function sendPhoneCode() {
    if (!isValidPhone(digits)) {
      setErrors((current) => ({ ...current, phone: 'Enter a phone number with area code.' }))
      return
    }
    setErrors((current) => ({ ...current, phone: '', phoneCode: '' }))
    setPhoneBusy(true)
    try {
      const { expiresAt } = await sendOtp({ type: 'phone', value: digits }, 'phoneNumberVerification')
      setPhoneCodeFor(digits)
      setPhoneResendAt(expiresAt)
      setPhoneCode('')
    } catch (error) {
      if (error?.status === 401) onExpired()
      else setErrors((current) => ({ ...current, phone: failureText(error, "We couldn't text a code to that number. Check it and try again.") }))
    } finally {
      setPhoneBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.firstName.trim()) next.firstName = 'Enter your first name.'
    if (!form.lastName.trim()) next.lastName = 'Enter your last name.'
    const birth = birthDateError(form.birthDate)
    if (birth) next.birthDate = birth
    if (digits && !isValidPhone(digits)) next.phone = 'Enter a phone number with area code.'
    if (codeSent && !isValidOtp(phoneCode)) next.phoneCode = 'Enter the text verification code, or change the phone number.'
    if (form.password && !passwordValid(form.password)) next.password = 'Choose a password that meets every requirement.'
    setErrors(next)
    setMessage('')
    if (Object.keys(next).length) return

    const body = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), birthDate: form.birthDate }
    if (medical && form.medicalId.trim()) body.medicalId = form.medicalId.trim()
    if (digits) body.phone = codeSent ? { value: digits, otp: { value: phoneCode } } : { value: digits }
    if (form.password) body.password = form.password

    setBusy(true)
    try {
      const { token } = await createUser(body)
      await onDone(token)
    } catch (error) {
      if (error?.status === 401) {
        onExpired()
        return
      }
      setMessage(error?.status === 400 ? "We couldn't create your account. Check the details and try again." : failureText(error, "We couldn't create your account. Try again."))
      if (body.phone?.otp) setErrors((current) => ({ ...current, phoneCode: "That code didn't work. Check it or send a new one." }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      {message && <Alert>{message}</Alert>}
      <div className="acct-two">
        <TextField id="signup-first" label="First name" autoComplete="given-name" autoFocus value={form.firstName} onChange={field('firstName')} error={errors.firstName} />
        <TextField id="signup-last" label="Last name" autoComplete="family-name" value={form.lastName} onChange={field('lastName')} error={errors.lastName} />
      </div>
      <TextField id="signup-birth" label="Date of birth" type="date" autoComplete="bday" max={latestBirthDateFor21()} hint="You must be 21 or older." value={form.birthDate} onChange={field('birthDate')} error={errors.birthDate} />

      <div className="acct-stack">
        <TextField
          id="signup-phone"
          label="Mobile phone (optional)"
          type="tel"
          autoComplete="tel"
          hint={codeSent ? 'Enter the text code to verify this number.' : 'Verify it with a text code to confirm it.'}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={errors.phone}
        />
        {digits && !codeSent && (
          <div className="acct-links">
            <button type="button" className="secondary-button" onClick={sendPhoneCode} disabled={phoneBusy}>
              {phoneBusy && <Loader2 className="spin" size={16} aria-hidden="true" />}
              Verify by text
            </button>
          </div>
        )}
        {codeSent && (
          <CodeField
            id="signup-phone-code"
            label="Text code"
            value={phoneCode}
            onChange={setPhoneCode}
            resendAt={phoneResendAt}
            onResend={sendPhoneCode}
            error={errors.phoneCode}
            sentTo={digits}
          />
        )}
      </div>

      {medical && (
        <TextField id="signup-medical" label="Medical ID (optional)" hint="Only needed for medical purchases." autoComplete="off" value={form.medicalId} onChange={field('medicalId')} />
      )}

      <NewPasswordField
        id="signup-password"
        label="Password (optional)"
        hint="Leave this blank to sign in with an email code."
        value={form.password}
        onChange={(value) => setForm((current) => ({ ...current, password: value }))}
        error={errors.password}
      />

      <button className="primary-button wide" type="submit" disabled={busy}>
        {busy && <Loader2 className="spin" size={18} aria-hidden="true" />}
        Create account
      </button>
      <div className="acct-links">
        <button type="button" className="text-button" onClick={onStartOver} disabled={busy}>Use a different email</button>
      </div>
    </form>
  )
}
