// Shown when the server has no store configured. Shoppers read that the page isn't available; the setup hint only
// appears in development, so a misconfigured deploy never shows build details.
export function NotConnected({ icon: Icon, title, level = 2 }) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <div className="state-panel" role="alert">
      <Icon size={28} aria-hidden="true" />
      {import.meta.env.DEV ? (
        <>
          <Heading>Store not connected</Heading>
          <p>Set <code>STORE_ID</code> and <code>API_BASE_URL</code> in <code>.env</code>, then restart the server.</p>
        </>
      ) : (
        <>
          <Heading>{title}</Heading>
          <p>Please try again in a little while.</p>
        </>
      )}
    </div>
  )
}
