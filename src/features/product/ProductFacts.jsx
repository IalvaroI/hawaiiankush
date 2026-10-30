import { Link } from 'react-router-dom'
import { attributeGroups, documentLinks, paragraphs, shopHref, strainTone } from './productModel.js'

// Everything below the buy box: attribute links, lab documents and the description. Potency and terpenes sit above
// the price (PotencyPanel).
// Each block is hidden when the product has no data for it.
export function ProductFacts({ product, variant }) {
  const groups = attributeGroups(product.attributes)
  const documents = documentLinks(variant?.documents)
  const about = paragraphs(product.description)

  return (
    <>
      {groups.length > 0 && (
        <section className="pd-section" aria-label="Product details">
          {groups.map((group) => (
            <div className="pd-group" key={group.title}>
              <h2 className="eyebrow pd-label">{group.title}</h2>
              <ul className="pd-chips">
                {group.items.map((item, position) => {
                  const href = shopHref(item.filters)
                  // A strain type is a coloured pill; everything else (effects included) is a plain chip.
                  const className = item.tone ? `strain-pill pd-strain is-${strainTone(item.name)}` : 'pd-chip'
                  return (
                    <li key={`${item.key}-${position}`}>
                      {href
                        ? <Link className={className} to={href}>{item.name}</Link>
                        : <span className={className}>{item.name}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {documents.length > 0 && (
        <section className="pd-section" aria-labelledby="pd-documents">
          <h2 id="pd-documents" className="eyebrow pd-label">Documents</h2>
          <ul className="pd-docs">
            {documents.map((doc) => (
              <li key={doc.key}><a href={doc.href} target="_blank" rel="noopener noreferrer">{doc.label}</a></li>
            ))}
          </ul>
        </section>
      )}

      {about.length > 0 && (
        <section className="pd-section pd-about" aria-labelledby="pd-about">
          <h2 id="pd-about" className="eyebrow pd-label">About this product</h2>
          {about.map((text, position) => <p key={position}>{text}</p>)}
        </section>
      )}
    </>
  )
}
