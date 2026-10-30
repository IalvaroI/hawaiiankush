import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../api/client.js'
import { SALE_TYPE } from '../../config.js'
import { apiFilters } from '../product/productModel.js'
import { carouselNames } from './carouselNames.js'
import { ProductGrid, ProductGridSkeleton, relationMaps } from './ProductGrid.jsx'

const RAIL_SIZE = 12
const MAX_RAILS = 6

// The store's carousels (set up in the Sweed portal), each as a scrolling row of product cards on the home page.
// A carousel with no products in stock for this sale type is left out.
export function Carousels() {
  const [carousels, setCarousels] = useState([])
  useEffect(() => {
    let active = true
    api(`/carousels?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}&Pagination.Page=1&Pagination.PageSize=${MAX_RAILS}`)
      .then((result) => { if (active) setCarousels((result?.items || []).filter((item) => item?.id && item?.name && Number(item.totalItems ?? 1) > 0)) })
      .catch(() => {})
    return () => { active = false }
  }, [])
  if (!carousels.length) return null
  return <div className="carousels">{carousels.map((carousel) => <Rail key={carousel.id} carousel={carousel} />)}</div>
}

// One carousel. All rails load together when the home page opens, so the page settles before the shopper scrolls
// rather than shifting under them as rows fill in.
function Rail({ carousel }) {
  const trackRef = useRef(null)
  const [state, setState] = useState({ status: 'loading', items: [], relations: {}, total: 0 })
  const [edges, setEdges] = useState({ start: true, end: false })
  const filters = apiFilters(carousel.filters)

  useEffect(() => {
    if (!filters) return undefined
    let active = true
    api(`/products?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}&Pagination.Page=1&Pagination.PageSize=${RAIL_SIZE}&${filters}`)
      .then((result) => { if (active) setState({ status: 'ready', items: result?.items || [], relations: result?.relations || {}, total: Number(result?.totalItems || 0) }) })
      .catch(() => { if (active) setState({ status: 'failed', items: [], relations: {}, total: 0 }) })
    return () => { active = false }
  }, [filters])

  // Arrows are disabled at either end of the row.
  function measure() {
    const track = trackRef.current?.querySelector('.product-carousel')
    if (!track) return
    setEdges({ start: track.scrollLeft <= 2, end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 })
  }
  useEffect(() => {
    const track = trackRef.current?.querySelector('.product-carousel')
    if (!track) return undefined
    measure()
    track.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => { track.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [state.status])

  function scroll(direction) {
    const track = trackRef.current?.querySelector('.product-carousel')
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.9, behavior: 'smooth' })
  }

  if (!filters || state.status === 'failed' || (state.status === 'ready' && !state.items.length)) return null
  const titleId = `carousel-${carousel.id}`
  const maps = relationMaps(state.relations)
  return (
    <section className="carousel" aria-labelledby={titleId}>
      <header className="carousel-head">
        <h2 id={titleId} className="carousel-title">{carousel.name}</h2>
        <Link className="carousel-all" to={`/shop?f.carousel=${encodeURIComponent(carousel.id)}`}>
          See all{state.total > 0 && <span className="carousel-count"> {state.total}</span>}<ArrowRight size={16} aria-hidden="true" />
        </Link>
        <div className="carousel-arrows">
          <button type="button" className="carousel-arrow" aria-label={`Scroll ${carousel.name} back`} disabled={edges.start} onClick={() => scroll(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="carousel-arrow" aria-label={`Scroll ${carousel.name} forward`} disabled={edges.end} onClick={() => scroll(1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </header>
      <div ref={trackRef}>
        {state.status === 'ready'
          ? <ProductGrid products={state.items} brands={maps.brands} strains={maps.strains} rail />
          : <ProductGridSkeleton count={4} rail />}
      </div>
    </section>
  )
}
