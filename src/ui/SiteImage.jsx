// Photos for the site's own sections (hero, promo, story band, page banners), named in public/content.json so they
// can be swapped without a rebuild. An image is either a single URL, or { "base": "images/site/name", "widths":
// [700, 1200] } for files exported as name-700.webp / name-700.jpg and so on (WebP first, JPEG as the fallback).
// Relative paths are under the app's base path; full URLs and root paths are used as they are.

const resolve = (path) => (/^(https?:)?\/\//i.test(path) || path.startsWith('/') ? path : `${import.meta.env.BASE_URL}${path}`)

export function imageSources(spec) {
  if (typeof spec === 'string' && spec.trim()) return { src: resolve(spec.trim()) }
  const base = typeof spec?.base === 'string' ? spec.base.trim() : ''
  const widths = (Array.isArray(spec?.widths) ? spec.widths : []).map(Number).filter((width) => width > 0).sort((a, b) => a - b)
  if (!base || !widths.length) return null
  const set = (ext) => widths.map((width) => `${resolve(`${base}-${width}.${ext}`)} ${width}w`).join(', ')
  return { src: resolve(`${base}-${widths.at(-1)}.jpg`), jpg: set('jpg'), webp: set('webp') }
}

// `mobile` is an optional second image for narrow screens (below 600px), e.g. a portrait crop of the hero.
export function SiteImage({ image, mobile, sizes = '100vw', className, priority = false }) {
  const main = imageSources(image)
  if (!main) return null
  const narrow = imageSources(mobile)
  const query = '(max-width: 599px)'
  return (
    <picture className={className}>
      {narrow?.webp && <source media={query} type="image/webp" srcSet={narrow.webp} sizes="100vw" />}
      {narrow && <source media={query} srcSet={narrow.jpg || narrow.src} sizes="100vw" />}
      {main.webp && <source type="image/webp" srcSet={main.webp} sizes={sizes} />}
      <img
        src={main.src}
        srcSet={main.jpg}
        sizes={main.jpg ? sizes : undefined}
        alt=""
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        {...(priority ? { fetchpriority: 'high' } : {})}
      />
    </picture>
  )
}
