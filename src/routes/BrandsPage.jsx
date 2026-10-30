import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award } from 'lucide-react'
import { joinSlugId } from '../../shared/slug.js'
import { fetchAll } from '../api/client.js'
import { DEMO_MODE, STORE_ID } from '../config.js'
import { imageUrl } from '../lib/format.js'
import { useCart } from '../layout/CartContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import './pages.css'
import { NotConnected } from '../ui/NotConnected.jsx'
import { errorText } from '../lib/errors.js'

// The directory letter: the first letter with its accent removed, or "#" for anything that is not a letter.
export function letterOf(name) {
  const first = String(name ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : '#'
}

// Up to two initials for a brand without an image: "Koa Creek Co." becomes "KC".
export function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => [...word][0].toUpperCase()).join('') || '#'
}

// A brand's first image, or its initials in a circle when there is none or it fails to load.
export function BrandMark({ brand, large = false }) {
  const src = imageUrl(brand?.images?.[0])
  const [failed, setFailed] = useState(false)
  return (
    <span className={`brand-mark${large ? ' is-large' : ''}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initialsOf(brand?.name)}
    </span>
  )
}

function BrandCard({ brand }) {
  return (
    <Link className="brand-card" to={`/b/${joinSlugId(brand.name, brand.id)}`}>
      <BrandMark brand={brand} />
      <span className="brand-card-name">{brand.name}</span>
    </Link>
  )
}

// Brands per letter needed before the directory groups by letter (with a letter index); below it, one even grid.
const GROUP_FILL = 2.5

// Brands: the whole directory, A to Z, with a letter index.
export function BrandsPage() {
  const { store } = useCart()
  const connected = !DEMO_MODE && Boolean(STORE_ID)
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!connected) return undefined
    let active = true
    setBrands(null)
    setError('')
    fetchAll('/brands', 20).then((list) => {
      if (!active) return
      const unique = [...new Map(list.filter((brand) => brand?.id).map((brand) => [String(brand.id), brand])).values()]
      setBrands(unique)
    }).catch((err) => {
      if (active) setError(errorText(err, 'Brands could not be loaded. Try again in a moment.'))
    })
    return () => { active = false }
  }, [connected, attempt])

  // Until the store is known the server's title stays.
  usePageTitle(store?.name ? `Brands · ${store.name}` : '')

  // Sorted A to Z, then grouped by letter; "#" comes last.
  const groups = useMemo(() => {
    if (!brands) return []
    const sorted = [...brands].sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base', numeric: true }))
    const byLetter = new Map()
    for (const brand of sorted) {
      const letter = letterOf(brand.name)
      byLetter.set(letter, [...(byLetter.get(letter) || []), brand])
    }
    return [...byLetter.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
  }, [brands])

  let body
  if (!connected) {
    body = <NotConnected icon={Award} title="Brands aren’t available right now" />
  } else if (error) {
    body = (
      <div className="state-panel" role="alert">
        <Award size={28} aria-hidden="true" />
        <h2>Brands didn’t load</h2>
        <p>{error}</p>
        <button className="primary-button" type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
      </div>
    )
  } else if (brands === null) {
    body = (
      <div className="brand-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <div className="skeleton" key={index}><div className="skeleton-line" /></div>)}
      </div>
    )
  } else if (!brands.length) {
    body = <div className="state-panel"><Award size={28} aria-hidden="true" /><h2>No brands yet</h2><p>Brands will appear here as they are added to the menu.</p></div>
  } else if (groups.length > 1 && brands.length / groups.length < GROUP_FILL) {
    // Few brands spread over many letters: letter groups would mostly hold one card each, stranded on its own row, so
    // the directory is one even grid, A to Z, until there are enough brands to fill the groups.
    body = (
      <ul className="brand-grid is-even">
        {groups.flatMap(([, items]) => items).map((brand) => <li key={brand.id}><BrandCard brand={brand} /></li>)}
      </ul>
    )
  } else {
    body = (
      <>
        <nav aria-label="Jump to a letter">
          <ul className="letter-index">
            {groups.map(([letter]) => (
              <li key={letter}><a href={`#brands-${letter === '#' ? 'other' : letter}`}>{letter}</a></li>
            ))}
          </ul>
        </nav>
        <div className="brand-groups">
          {groups.map(([letter, items]) => (
            <section className="brand-group" id={`brands-${letter === '#' ? 'other' : letter}`} key={letter} aria-labelledby={`brands-${letter === '#' ? 'other' : letter}-title`}>
              <h2 id={`brands-${letter === '#' ? 'other' : letter}-title`}>{letter}</h2>
              <ul className="brand-grid">
                {items.map((brand) => <li key={brand.id}><BrandCard brand={brand} /></li>)}
              </ul>
            </section>
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="sheet page">
      <header className="page-head">
        <h1 className="page-title">Brands</h1>
        {brands && brands.length > 0 && <p className="page-lede">{brands.length} {brands.length === 1 ? 'brand' : 'brands'}, A to Z</p>}
      </header>
      {body}
    </div>
  )
}
