import { useContent } from '../lib/content.js'
import { useCart } from '../layout/CartContext.jsx'
import { SiteImage } from '../ui/SiteImage.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import './pages.css'

// Body text is split into paragraphs at blank lines.
const paragraphsOf = (text) => String(text ?? '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)

// Learn: the store's own guides, from public/content.json, in a readable column.
export function LearnPage() {
  const { store } = useCart()
  const { learn } = useContent()
  const title = learn?.title || 'Learn'
  const sections = (Array.isArray(learn?.sections) ? learn.sections : []).filter((section) => section?.title || section?.body)

  // Until the store is known the server's title stays.
  usePageTitle(store?.name ? `${title} · ${store.name}` : '')

  return (
    <div className="sheet page">
      <article className="article">
        <SiteImage className="page-banner" image={learn?.image} sizes="(max-width: 899px) 100vw, 900px" priority />
        <header className="page-head">
          <h1 className="page-title">{title}</h1>
          {learn?.intro && <p className="article-intro">{learn.intro}</p>}
        </header>
        {sections.map((section, index) => {
          const headingId = `learn-${index}`
          return (
            <section className="article-section" key={`${section.title}-${index}`} aria-labelledby={section.title ? headingId : undefined}>
              {section.title && <h2 id={headingId}>{section.title}</h2>}
              {paragraphsOf(section.body).map((paragraph, position) => <p key={position}>{paragraph}</p>)}
            </section>
          )
        })}
      </article>
    </div>
  )
}
