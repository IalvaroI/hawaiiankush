import { Check } from 'lucide-react'

// One checkout step: a heading and a number, a one-line summary once it is done, and the form only while it is open.
export function StepShell({ id, number, title, summary = '', open, done, onEdit, action = null, children }) {
  const headingId = `co-${id}-heading`
  const className = ['co-step', open && 'is-open', done && !open && 'is-done'].filter(Boolean).join(' ')
  return (
    <section className={className} aria-labelledby={headingId}>
      <div className="co-step-head">
        <span className="co-step-mark" aria-hidden="true">{done && !open ? <Check size={16} strokeWidth={2.5} /> : number}</span>
        <div className="co-step-title">
          <h2 id={headingId}>{title}</h2>
          {!open && summary && <p className="co-step-summary">{summary}</p>}
        </div>
        {!open && done && onEdit && (
          <button type="button" className="co-edit" onClick={onEdit}>Edit<span className="sr-only"> {title.toLowerCase()}</span></button>
        )}
        {!open && !done && action}
      </div>
      {open && <div className="co-step-body">{children}</div>}
    </section>
  )
}
