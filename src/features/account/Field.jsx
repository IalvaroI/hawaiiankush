// A labelled text field in the shared .field style. The label wraps the input, so every field has an accessible name;
// the hint and the error are linked to the input with aria-describedby.
export function TextField({ id, label, hint, error, ...input }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="acct-field">
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input id={id} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...input} />
      </label>
      {hint && <p id={`${id}-hint`} className="acct-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    </div>
  )
}
