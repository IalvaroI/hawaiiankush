const METHODS = { email: 'Email', sms: 'Text message', push: 'Push notification' }
const GROUPS = [['promotions', 'Promotions'], ['transactions', 'Order updates']]

// Read-only: the API has no endpoint that changes notification settings.
export function NotificationsSection({ settings }) {
  return (
    <>
      <h2 id="acct-notify">Notifications</h2>
      {settings === undefined && <p className="acct-muted">Loading...</p>}
      {settings === null && <p className="acct-muted" role="status">Your notification settings could not be loaded right now.</p>}
      {settings && (
        <div className="acct-notify">
          {GROUPS.map(([key, label]) => (
            <div key={key}>
              <h3>{label}</h3>
              <ul>
                {(settings.notifications?.[key] || []).map((item) => (
                  <li key={item.method}>
                    <span>{METHODS[item.method] || item.method}</span>
                    <span className={item.enabled ? 'acct-on' : 'acct-off'}>{item.enabled ? 'On' : 'Off'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="acct-muted">Change these in the store app or by contacting us.</p>
    </>
  )
}
