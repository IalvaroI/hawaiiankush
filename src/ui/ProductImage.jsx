import { useState } from 'react'
import { Leaf } from 'lucide-react'
import { photoFor } from '../photos.js'
import { firstImage, imageUrl } from '../lib/format.js'

// Prefer the item's own photo, then library imagery, the store category image, and an icon.
export function ProductImage({ product, category, className = '' }) {
  const sources = [
    firstImage(product),
    photoFor(category?.name, product?.id, product?.name),
    imageUrl(category?.images?.[0]),
  ].filter(Boolean)
  const [index, setIndex] = useState(0)
  const source = sources[index]
  return (
    <div className={`product-image ${className}${source ? '' : ' is-empty'}`}>
      {source
        ? <img src={source} alt="" loading="lazy" onError={() => setIndex((current) => current + 1)} />
        : <Leaf size={28} strokeWidth={1.5} aria-hidden="true" />}
    </div>
  )
}
