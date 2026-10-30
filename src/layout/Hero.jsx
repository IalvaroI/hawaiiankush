import { ArrowRight, Award, Clock, FlaskConical, Heart, Leaf, MapPin, ShieldCheck, Sparkles, Star, Sun, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useContent } from '../lib/content.js'
import { SiteImage, imageSources } from '../ui/SiteImage.jsx'

// Icon keys used in content.json. An unknown or missing key gets the default icon.
const ICONS = { lab: FlaskConical, award: Award, waves: Waves, leaf: Leaf, heart: Heart, shield: ShieldCheck, sun: Sun, star: Star, map: MapPin, clock: Clock }

// Internal links go through the router; a full URL in content.json is a plain link.
export function CtaLink({ to, className, children }) {
  return /^https?:\/\//i.test(to)
    ? <a className={className} href={to}>{children}</a>
    : <Link className={className} to={to}>{children}</Link>
}

// Home-page banner. Its copy, photo and trust items come from public/content.json. The photo keeps its subject on the
// right (top on phones), so the copy sits on the open sky and sea, and the trust items get their own row below.
export function Hero() {
  const { hero, trust } = useContent()
  const items = (Array.isArray(trust) ? trust : []).filter((item) => item?.title)
  const hasImage = Boolean(imageSources(hero.image?.desktop))
  return (
    <>
      <section className={`hero ${hasImage ? 'has-media' : ''}`} aria-labelledby="hero-title">
        {hasImage && <SiteImage className="hero-media" image={hero.image.desktop} mobile={hero.image.mobile} sizes="(max-width: 1279px) 100vw, 1000px" priority />}
        <div className="hero-copy">
          {hero.eyebrow && <p className="eyebrow">{hero.eyebrow}</p>}
          <h2 id="hero-title">{hero.title}</h2>
          {hero.subtitle && <p className="hero-sub">{hero.subtitle}</p>}
          {(hero.cta?.label || hero.secondaryCta?.label) && (
            <div className="hero-actions">
              {hero.cta?.label && hero.cta?.to && (
                <CtaLink className="hero-cta" to={hero.cta.to}>{hero.cta.label} <ArrowRight size={18} aria-hidden="true" /></CtaLink>
              )}
              {hero.secondaryCta?.label && hero.secondaryCta?.to && (
                <CtaLink className="hero-link" to={hero.secondaryCta.to}>{hero.secondaryCta.label}</CtaLink>
              )}
            </div>
          )}
        </div>
      </section>
      {items.length > 0 && (
        <ul className="hero-trust">
          {items.map((item, index) => {
            const Icon = ICONS[item.icon] || Sparkles
            return (
              <li className="trust-card" key={`${item.title}-${index}`}>
                <span className="trust-icon"><Icon size={22} strokeWidth={1.5} aria-hidden="true" /></span>
                <div>
                  <strong>{item.title}</strong>
                  {item.text && <span>{item.text}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
