import { Award, BadgePercent, BookOpen, Cannabis, Download, Heart, MapPin, Share, Sparkles, Sprout, Star } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useContent } from '../lib/content.js'
import { useInstall } from '../lib/useInstall.js'
import { normalizeSort } from '../routes/catalogQuery.js'
import { useSavedIds } from '../routes/SavedPage.jsx'

// Nav items. The Staff Picks item only exists when the store has a tag named like "Staff Pick" (see AppShell).
function navItems(staffPickId, savedCount) {
  const onShop = (pathname) => pathname.startsWith('/shop')
  const items = [
    { label: 'Menu', to: '/', icon: Cannabis, active: (pathname) => pathname === '/' || pathname.startsWith('/c/') },
    { label: 'Deals', to: '/deals', icon: BadgePercent, active: (pathname) => pathname === '/deals' },
    { label: 'New Arrivals', to: '/shop?sort=createdDesc', icon: Sprout, active: (pathname, params) => onShop(pathname) && normalizeSort(params.get('sort')) === 'createdDesc' },
  ]
  if (staffPickId) {
    items.push({ label: 'Staff Picks', to: `/shop?f.userTag=${encodeURIComponent(staffPickId)}`, icon: Star, active: (pathname, params) => onShop(pathname) && (params.get('f.userTag') || '').split(',').includes(staffPickId) })
  }
  items.push(
    { label: 'Find your match', to: '/picker', icon: Sparkles, active: (pathname) => pathname.startsWith('/picker') },
    { label: 'Saved', to: '/saved', icon: Heart, active: (pathname) => pathname === '/saved', badge: savedCount },
    { label: 'Brands', to: '/brands', icon: Award, active: (pathname) => pathname.startsWith('/brands') || pathname.startsWith('/b/') },
    { label: 'Learn', to: '/learn', icon: BookOpen, active: (pathname) => pathname.startsWith('/learn') },
    { label: 'Locations', to: '/locations', icon: MapPin, active: (pathname) => pathname.startsWith('/locations') },
  )
  return items
}

// The store's logo when it loads; the store name in the display face when there is none or it fails to load.
function Wordmark({ storeName, logo }) {
  const [failed, setFailed] = useState(false)
  return logo && !failed
    ? <img className="brand-logo" src={logo} alt={storeName} onError={() => setFailed(true)} />
    : <span className="brand-name">{storeName}</span>
}

export function Sidebar({ storeName, logo, staffPickId = '', onNavigate }) {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const { sidebarTagline } = useContent()
  const savedCount = useSavedIds().length
  const taglineLines = (Array.isArray(sidebarTagline) ? sidebarTagline : []).filter(Boolean)
  return (
    <aside className="sidebar" aria-label="Store">
      <Link to="/" className="brand" aria-label={storeName ? undefined : 'Home'} onClick={onNavigate}>
        <Wordmark storeName={storeName} logo={logo} />
      </Link>
      <nav aria-label="Main">
        <ul className="nav-list">
          {navItems(staffPickId, savedCount).map((item) => {
            const Icon = item.icon
            const active = item.active(pathname, params)
            return (
              <li key={item.label}>
                <Link to={item.to} className="nav-link" aria-current={active ? 'page' : undefined} onClick={onNavigate}>
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <InstallApp />
      {taglineLines.length > 0 && (
        <p className="tagline">
          {taglineLines.map((line, index) => (
            <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>
          ))}
        </p>
      )}
    </aside>
  )
}

// "Install app" at the foot of the menu: opens the browser's install prompt, or on iPhone Safari explains Add to Home
// Screen. Hidden when the browser offers neither or the shop is already installed.
function InstallApp() {
  const { mode, install } = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  if (!mode) return null
  return (
    <div className="install-app">
      <button type="button" className="install-button" aria-expanded={mode === 'ios' ? showSteps : undefined} onClick={() => (mode === 'prompt' ? install() : setShowSteps((open) => !open))}>
        <Download size={18} aria-hidden="true" /> Install app
      </button>
      {mode === 'ios' && showSteps && (
        <p className="install-steps">Tap <Share size={15} aria-label="Share" /> in Safari, then <strong>Add to Home Screen</strong>.</p>
      )}
    </div>
  )
}
