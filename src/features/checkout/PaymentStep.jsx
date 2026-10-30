import { CreditCard, Loader2 } from 'lucide-react'
import { StepShell } from './StepShell.jsx'
import { paymentLabel } from './checkoutDraft.js'

export function PaymentStep({ number, open, done, draft, updateDraft, methods, delivering, busy, error, onContinue, onEdit }) {
  const types = (methods.items || []).map((item) => item.type)
  const required = Boolean(methods.required)
  const summary = done && draft.paymentType ? paymentLabel(draft.paymentType, delivering) : done ? 'Not required' : ''

  return (
    <StepShell id="payment" number={number} title="Payment" summary={summary} open={open} done={done} onEdit={onEdit}>
      {types.length === 0 ? (
        <p className="co-notice" role="status">No payment methods are available right now.</p>
      ) : (
        <fieldset className="co-options">
          <legend>How will you pay?</legend>
          {types.map((type) => {
            const selected = draft.paymentType === type
            return (
              <label key={type} className={`co-option${selected ? ' is-selected' : ''}`}>
                <input type="radio" name="co-payment" value={type} checked={selected} onChange={() => updateDraft({ paymentType: type })} />
                <CreditCard size={20} aria-hidden="true" className="co-option-icon" />
                <span className="co-option-text"><strong>{paymentLabel(type, delivering)}</strong></span>
              </label>
            )
          })}
        </fieldset>
      )}
      {error && <p className="co-alert" role="alert">{error}</p>}
      <button className="primary-button wide" type="button" disabled={busy !== '' || types.length === 0 || (required && !draft.paymentType)} onClick={onContinue}>
        {busy === 'payment' && <Loader2 className="spin" size={18} aria-hidden="true" />} Continue
      </button>
    </StepShell>
  )
}
