import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="sheet state-page">
      <h1>Page not found</h1>
      <p>The link may be out of date, or the page has moved.</p>
      <Link className="primary-button state-link" to="/">Back to the menu</Link>
    </div>
  )
}
