import { useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { PASSWORD_RULES } from './accountRules.js'

// A new password with the store's policy as a live checklist. The checklist is text as well as icons, so it reads
// the same without colour.
export function NewPasswordField({ id, label = 'New password', value, onChange, error, hint }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="acct-stack">
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-rules`}
        />
      </label>
      {hint && <p className="acct-hint">{hint}</p>}
      <ul id={`${id}-rules`} className="acct-rules">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(value)
          return (
            <li key={rule.id} data-met={met ? 'true' : 'false'}>
              {met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              <span>{rule.label}</span>
              <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
            </li>
          )
        })}
      </ul>
      <label className="acct-check">
        <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} />
        <span>Show password</span>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
