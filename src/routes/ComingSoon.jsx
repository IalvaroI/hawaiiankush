import { Link } from 'react-router-dom'

// Placeholder for routes whose screens come in later batches. The path already works, so links and bookmarks hold.
export function ComingSoon({ title }) {
  return (
    <div className="sheet state-page">
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p>This page is on its way.</p>
      <Link className="primary-button state-link" to="/">Back to the menu</Link>
    </div>
  )
}
