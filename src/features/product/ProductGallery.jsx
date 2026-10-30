import { useEffect, useState } from 'react'
import { ProductImage } from '../../ui/ProductImage.jsx'
import { imageUrl } from '../../lib/format.js'
import { galleryImages } from './productModel.js'

// Product photos, then the selected variant's. A variant with its own photos opens on its first one.
export function ProductGallery({ product, variant, category }) {
  const [broken, setBroken] = useState({})
  const [active, setActive] = useState(0)
  const sources = galleryImages(product, variant).filter((src) => !broken[src])
  const variantKey = String(variant?.id ?? '')
  const startAt = Math.max(0, sources.indexOf(imageUrl(variant?.images?.[0])))

  // Only a change of variant resets the gallery; photos that fail later keep the reader's place.
  useEffect(() => {
    setActive(startAt)
  }, [variantKey])

  if (!sources.length) {
    return (
      <div className="pd-gallery">
        <div className="pd-main"><ProductImage product={product} category={category} /></div>
      </div>
    )
  }

  const index = Math.min(active, sources.length - 1)
  const markBroken = (src) => setBroken((current) => ({ ...current, [src]: true }))

  return (
    <div className="pd-gallery">
      <div className="pd-main">
        <img key={sources[index]} src={sources[index]} alt={product.name} onError={() => markBroken(sources[index])} />
      </div>
      {sources.length > 1 && (
        <div className="pd-thumbs" role="group" aria-label="Product photos">
          {sources.map((src, position) => (
            <button key={src} type="button" className="pd-thumb" aria-label={`Show photo ${position + 1}`} aria-pressed={position === index} onClick={() => setActive(position)}>
              <img src={src} alt="" loading="lazy" onError={() => markBroken(src)} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
