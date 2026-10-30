import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { latestBirthDateFor21 } from '../../lib/format.js'
import { StepShell } from './StepShell.jsx'
import { contactErrors } from './checkoutDraft.js'

const FIELDS = [
  { key: 'firstName', label: 'First name', type: 'text', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last name', type: 'text', autoComplete: 'family-name' },
  { key: 'email', label: 'Email', type: 'email', autoComplete: 'email', wide: true },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel', wide: true },
  { key: 'birthDate', label: 'Date of birth', type: 'date', autoComplete: 'bday', hint: 'You must be 21 or older.' },
]

// Errors show as you type once a field has a value, and for every empty field after a blur or a Continue press.
export function ContactStep({ number, open, done, guest, setGuest, busy, error, onContinue, onEdit }) {
  const [touched, setTouched] = useState({})
  const [attempted, setAttempted] = useState(false)
  const errors = contactErrors(guest)
  const shown = (key) => Boolean(errors[key] && (attempted || touched[key]))

  function change(key, value) {
    setGuest((current) => ({ ...current, [key]: value }))
    if (value.trim()) setTouched((current) => ({ ...current, [key]: true }))
  }

  function submit(event) {
    event.preventDefault()
    setAttempted(true)
    const first = FIELDS.find((field) => errors[field.key])
    if (first) {
      document.getElementById(`co-${first.key}`)?.focus()
      return
    }
    onContinue()
  }

  const summary = done ? `${guest.firstName.trim()} ${guest.lastName.trim()} · ${guest.email.trim()}` : ''

  return (
    <StepShell id="contact" number={number} title="Contact" summary={summary} open={open} done={done} onEdit={onEdit}>
      <form className="co-form" onSubmit={submit} noValidate>
        <div className="co-fields">
          {FIELDS.map((field) => {
            const id = `co-${field.key}`
            const invalid = shown(field.key)
            return (
              <div className={`field${field.wide ? ' co-wide' : ''}`} key={field.key}>
                <label htmlFor={id}>{field.label}</label>
                {field.hint && <small id={`${id}-hint`}>{field.hint}</small>}
                <input
                  id={id}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  inputMode={field.inputMode}
                  max={field.key === 'birthDate' ? latestBirthDateFor21() : undefined}
                  value={guest[field.key]}
                  aria-invalid={invalid ? 'true' : undefined}
                  aria-describedby={[field.hint && `${id}-hint`, invalid && `${id}-error`].filter(Boolean).join(' ') || undefined}
                  onChange={(event) => change(field.key, event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, [field.key]: true }))}
                />
                {invalid && <p className="field-error" id={`${id}-error`}>{errors[field.key]}</p>}
              </div>
            )
          })}
        </div>
        {error && <p className="co-alert" role="alert">{error}</p>}
        <button className="primary-button wide" type="submit" disabled={busy !== ''}>
          {busy === 'contact' && <Loader2 className="spin" size={18} aria-hidden="true" />} Continue
        </button>
      </form>
    </StepShell>
  )
}
