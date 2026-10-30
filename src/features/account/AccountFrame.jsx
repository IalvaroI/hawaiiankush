import { AlertCircle } from 'lucide-react'

// Page frame for the account screens: the cream sheet, a centred column, and a header. With `card`, the column is
// one white card (sign-in and sign-up); otherwise the header sits on the sheet and the sections below are cards.
export function AccountFrame({ narrow = false, card = false, eyebrow, title, lead, actions, children }) {
  const head = (eyebrow || title || lead || actions) && (
    <header className="acct-head">
      <div className="acct-title">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {title && <h1>{title}</h1>}
        {lead && <p className="acct-lead">{lead}</p>}
      </div>
      {actions}
    </header>
  )
  return (
    <div className="sheet acct-sheet">
      <div className={`acct-wrap${narrow ? ' narrow' : ''}`}>
        {card ? <section className="auth-card" aria-label={title || 'Account'}>{head}{children}</section> : <>{head}{children}</>}
      </div>
    </div>
  )
}

export function Alert({ children }) {
  return (
    <p className="acct-alert" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function Notice({ children }) {
  return <p className="acct-notice" role="status">{children}</p>
}
