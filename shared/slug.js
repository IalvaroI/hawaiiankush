// URL slugs for catalog pages, e.g. /maui/p/gummies-coconut-sour-ch2yqg8t3yxevp1hykb.
// Used by the server (canonical redirects) and the browser app (links), so no Node-only APIs here.

const MAX_SLUG_LENGTH = 60

export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // "Crème" -> "Creme"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '') // the cut may land on a hyphen
  return slug || 'item'
}

export function joinSlugId(name, id) {
  return `${slugify(name)}-${id}`
}

// API ids are alphanumeric and never contain hyphens, so the id is whatever follows the last hyphen.
export function splitSlugId(segment) {
  const text = String(segment ?? '')
  const dash = text.lastIndexOf('-')
  if (dash === -1) return { slug: '', id: text }
  return { slug: text.slice(0, dash), id: text.slice(dash + 1) }
}
