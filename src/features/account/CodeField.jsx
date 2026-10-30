import { useState } from 'react'
import { formatClock } from './accountRules.js'
import { useSecondsLeft } from './useSecondsLeft.js'

// A one-time code in one input (not separate boxes), so paste, SMS autofill and screen readers all work. Non-digits
// are dropped as typed or pasted. Accepts the live API's 4-digit codes and 6-digit test/other issuer codes.
// Resend stays disabled until `resendAt` (the API's resend gate) has passed.
export function CodeField({ id, label = 'Verification code', value, onChange, resendAt, onResend, error, sentTo, autoFocus = false }) {
  const left = useSecondsLeft(resendAt)
  const [resending, setResending] = useState(false)

  async function resend() {
    setResending(true)
    try {
      await onResend()
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="code-field">
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          className="code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          placeholder="Enter code"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </label>
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
      <div className="code-meta">
        {sentTo && <span className="acct-muted">Sent to {sentTo}</span>}
        <button type="button" className="text-button" disabled={left > 0 || resending} onClick={resend}>
          {left > 0 ? `Resend code in ${formatClock(left)}` : 'Resend code'}
        </button>
      </div>
    </div>
  )
}
