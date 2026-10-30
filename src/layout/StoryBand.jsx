import { ArrowRight } from 'lucide-react'
import { useContent } from '../lib/content.js'
import { SiteImage } from '../ui/SiteImage.jsx'
import { CtaLink } from './Hero.jsx'

// Two photo cards under the home-page menu: who the shop is and how to choose well. Copy, photos and links all come
// from public/content.json ("story"); an entry without a title is skipped.
export function StoryBand() {
  const { story } = useContent()
  const items = (Array.isArray(story) ? story : []).filter((item) => item?.title)
  if (!items.length) return null
  return (
    <section className="story-band" aria-label="About the shop">
      {items.map((item, index) => (
        <article className="story-card" key={`${item.title}-${index}`}>
          <SiteImage className="story-media" image={item.image} sizes="(max-width: 899px) 100vw, 560px" />
          <div className="story-copy">
            {item.eyebrow && <p className="eyebrow">{item.eyebrow}</p>}
            <h2>{item.title}</h2>
            {item.text && <p>{item.text}</p>}
            {item.cta?.label && item.cta?.to && (
              <CtaLink className="story-link" to={item.cta.to}>{item.cta.label} <ArrowRight size={16} aria-hidden="true" /></CtaLink>
            )}
          </div>
        </article>
      ))}
    </section>
  )
}
