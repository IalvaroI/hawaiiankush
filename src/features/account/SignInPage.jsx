import './account.css'
import { useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { AccountFrame, Alert, Notice } from './AccountFrame.jsx'
import { bringBagOver, emailContact, requestPasswordCode, savePassword, sendOtp, signIn } from './accountApi.js'
import { CodeField } from './CodeField.jsx'
import { TextField } from './Field.jsx'
import { ResetForm } from './ResetForm.jsx'
import { SignUpForm } from './SignUpForm.jsx'
import { failureText, isValidEmail, isValidOtp, safeNext } from './accountRules.js'
import { useSession } from './useSession.js'

const EMAIL_ERROR = 'Enter an email address, like name@example.com.'
const SEND_ERROR = "We couldn't send a code. Check the email address and try again."
const CODE_ERROR = "That code didn't work. Check it or request a new one."
const GENERIC_ERROR = "We couldn't sign you in. Try again."

// A wrong code is a 400 (401 is treated the same). Anything else keeps its own message (rate limit, connection).
const isCodeMiss = (error) => error?.status === 400 || error?.status === 401

// The password answer never says which half was wrong, and never says whether an account exists.
function passwordFailure(error) {
  if (error?.status === 401) return 'Email or password is incorrect.'
  if (error?.status === 400) return 'Check your email and password and try again.'
  return failureText(error, GENERIC_ERROR)
}

// Steps: email (send a code) > code (sign in with it), or password > reset (forgotten password, then back to password).
// A registration token opens sign-up instead. `next` is where a successful sign-in lands.
export function SignInPage() {
  const { session, loading, refresh, signOut } = useSession()
  const { flash, adoptUserCart, store } = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pass, setPass] = useState('')
  const [resendAt, setResendAt] = useState('')
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Set before the session reloads, so the redirect for signed-in visitors waits until the bag has moved over.
  const finishing = useRef(false)

  const medical = (store?.saleTypes || []).includes('medical')
  const signingUp = step === 'signup' || session?.tokenType === 'registration'

  function clearMessages() {
    setErrors({})
    setMessage('')
    setNotice('')
  }

  // Every successful sign-in or sign-up ends here: the session is reloaded, the anonymous bag moves into the account,
  // and the visitor lands on `next`.
  async function completeSignIn(token) {
    if (token?.tokenType === 'registration') {
      await refresh()
      setStep('signup')
      return
    }
    finishing.current = true
    const current = await refresh()
    if (!current?.signedIn) {
      finishing.current = false
      setMessage(GENERIC_ERROR)
      return
    }
    const moved = await bringBagOver()
    await adoptUserCart()
    if (moved) flash('Signed in')
    else flash("Signed in, but your bag couldn't be combined with your account. It's still on this device.", 'error')
    navigate(next, { replace: true })
  }

  async function sendEmailCode(event) {
    event.preventDefault()
    const value = email.trim()
    if (!isValidEmail(value)) {
      setErrors({ email: EMAIL_ERROR })
      return
    }
    clearMessages()
    setBusy(true)
    try {
      const { expiresAt } = await sendOtp(emailContact(value), 'authorization')
      setEmail(value)
      setResendAt(expiresAt)
      setCode('')
      setStep('code')
    } catch (error) {
      setMessage(failureText(error, SEND_ERROR))
    } finally {
      setBusy(false)
    }
  }

  async function resendEmailCode() {
    try {
      const { expiresAt } = await sendOtp(emailContact(email), 'authorization')
      setResendAt(expiresAt)
      setErrors({})
    } catch (error) {
      setErrors({ code: failureText(error, "We couldn't send a new code. Try again in a moment.") })
    }
  }

  async function signInWithCode(event) {
    event.preventDefault()
    if (!isValidOtp(code)) {
      setErrors({ code: 'Enter the verification code from your email.' })
      return
    }
    clearMessages()
    setBusy(true)
    try {
      const { token } = await signIn(emailContact(email), { type: 'otp', value: code })
      await completeSignIn(token)
    } catch (error) {
      if (isCodeMiss(error)) setErrors({ code: CODE_ERROR })
      else setMessage(failureText(error, GENERIC_ERROR))
    } finally {
      setBusy(false)
    }
  }

  async function signInWithPassword(event) {
    event.preventDefault()
    const value = email.trim()
    if (!isValidEmail(value)) {
      setErrors({ email: EMAIL_ERROR })
      return
    }
    if (!pass) {
      setErrors({ password: 'Enter your password.' })
      return
    }
    clearMessages()
    setBusy(true)
    try {
      setEmail(value)
      const { token } = await signIn({ type: 'email', value }, { type: 'password', value: pass })
      await completeSignIn(token)
    } catch (error) {
      setMessage(passwordFailure(error))
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    const value = email.trim()
    if (!isValidEmail(value)) {
      setErrors({ email: EMAIL_ERROR })
      return
    }
    clearMessages()
    setBusy(true)
    try {
      const { expiresAt } = await requestPasswordCode(value)
      setEmail(value)
      setResendAt(expiresAt)
      setStep('reset')
    } catch (error) {
      setMessage(failureText(error, SEND_ERROR))
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(otp, password) {
    await savePassword({ email, otp, password })
    setPass('')
    setErrors({})
    setMessage('')
    setNotice('Password set — sign in with it now.')
    setStep('password')
  }

  async function startOver() {
    clearMessages()
    try {
      await signOut()
      setStep('email')
    } catch {
      setMessage(GENERIC_ERROR)
    }
  }

  async function signUpExpired() {
    await refresh()
    setStep('email')
    setMessage('Your sign-up expired. Enter your email to start again.')
  }

  // Signed-in visitors go straight to `next`, except while the bag is moving over (see completeSignIn).
  if (session?.signedIn && !finishing.current) return <Navigate to={next} replace />
  if (!session && loading) {
    return <AccountFrame narrow card><p className="acct-muted">Loading…</p></AccountFrame>
  }

  if (signingUp) {
    return (
      <AccountFrame narrow card title="Create your account" lead="A few details and you are in. Your email is confirmed.">
        <SignUpForm medical={medical} onDone={completeSignIn} onExpired={signUpExpired} onStartOver={startOver} />
      </AccountFrame>
    )
  }

  if (step === 'code') {
    return (
      <AccountFrame narrow card title="Enter your code" lead={<>We sent a verification code to <strong>{email}</strong>. It can take a minute to arrive.</>}>
        <form className="acct-form" onSubmit={signInWithCode} noValidate>
          {message && <Alert>{message}</Alert>}
          <CodeField id="sign-in-code" value={code} onChange={setCode} resendAt={resendAt} onResend={resendEmailCode} error={errors.code} autoFocus />
          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy && <Loader2 className="spin" size={18} aria-hidden="true" />}
            Continue
          </button>
          <div className="acct-links">
            <button type="button" className="text-button" onClick={() => { clearMessages(); setStep('email') }} disabled={busy}>Change email</button>
            <button type="button" className="text-button" onClick={() => { clearMessages(); setStep('password') }} disabled={busy}>Use password instead</button>
          </div>
        </form>
      </AccountFrame>
    )
  }

  if (step === 'password') {
    return (
      <AccountFrame narrow card title="Sign in with password" lead="Use the email and password you set on your account.">
        <form className="acct-form" onSubmit={signInWithPassword} noValidate>
          {notice && <Notice>{notice}</Notice>}
          {message && <Alert>{message}</Alert>}
          <TextField id="password-email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} />
          <TextField id="password-value" label="Password" type="password" autoComplete="current-password" autoFocus value={pass} onChange={(event) => setPass(event.target.value)} error={errors.password} />
          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy && <Loader2 className="spin" size={18} aria-hidden="true" />}
            Sign in
          </button>
          <div className="acct-links">
            <button type="button" className="text-button" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            <button type="button" className="text-button" onClick={() => { clearMessages(); setStep('email') }} disabled={busy}>Use a code instead</button>
          </div>
        </form>
      </AccountFrame>
    )
  }

  if (step === 'reset') {
    return (
      <AccountFrame narrow card title="Set a new password" lead={<>Enter the code we sent to <strong>{email}</strong>, then choose a new password.</>}>
        <ResetForm
          idPrefix="reset"
          email={email}
          initialResendAt={resendAt}
          onResend={() => requestPasswordCode(email).then((result) => result.expiresAt)}
          onSubmit={resetPassword}
          onBack={() => { clearMessages(); setStep('password') }}
          submitLabel="Set password"
        />
      </AccountFrame>
    )
  }

  return (
    <AccountFrame narrow card title="Sign in" lead="Enter your email and we’ll send you a code. New here? The same code creates your account.">
      <form className="acct-form" onSubmit={sendEmailCode} noValidate>
        {message && <Alert>{message}</Alert>}
        <TextField id="sign-in-email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} />
        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy && <Loader2 className="spin" size={18} aria-hidden="true" />}
          Continue
        </button>
        <div className="acct-links">
          <button type="button" className="text-button" onClick={() => { clearMessages(); setStep('password') }} disabled={busy}>Use password instead</button>
        </div>
      </form>
    </AccountFrame>
  )
}
