import { DEMO_MODE } from '../../config.js'

export function HelpSection({ store }) {
  const email = store?.contacts?.email || (DEMO_MODE ? 'hello@example.com' : '')
  const phone = store?.contacts?.phone || ''
  if (!email && !phone) return null
  return (
    <section className="help" aria-labelledby="help-title">
      <h2 id="help-title">Questions about an order?</h2>
      <div className="help-links">
        {email && <a href={`mailto:${email}`}>{email}</a>}
        {phone && <a href={`tel:${phone}`}>{phone}</a>}
      </div>
    </section>
  )
}
