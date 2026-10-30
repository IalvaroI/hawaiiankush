import LIBRARY from './photo-library.json' with { type: 'json' }

const CATEGORY_ALIASES = {
  flower: 'flower', cannabis: 'flower', infused: 'flower', ground: 'flower', shake: 'flower', trim: 'flower', 'mixed buds': 'flower', 'small flower': 'flower',
  edible: 'edibles', edibles: 'edibles', food: 'edibles', candy: 'edibles', gummies: 'edibles', cooking: 'edibles', chocolate: 'edibles', chews: 'edibles', 'baked goods': 'edibles', 'beverage infusions': 'edibles', powders: 'edibles', drinks: 'edibles', shots: 'edibles', mixes: 'edibles', syrups: 'edibles', capsules: 'edibles', tablets: 'edibles',
  preroll: 'pre-rolls', 'pre roll': 'pre-rolls', prerolls: 'pre-rolls', 'pre rolls': 'pre-rolls', singles: 'pre-rolls', packs: 'pre-rolls', 'infused singles': 'pre-rolls', 'infused packs': 'pre-rolls',
  vape: 'vape', vapes: 'vape', cartridge: 'vape', cartridges: 'vape', vaporizer: 'vape', vaporizers: 'vape',
  concentrate: 'concentrates', concentrates: 'concentrates', extract: 'concentrates', extracts: 'concentrates',
  tincture: 'tinctures', tinctures: 'tinctures',
  topical: 'topicals', topicals: 'topicals', balms: 'topicals', lotions: 'topicals', skincare: 'topicals', serums: 'topicals', sprays: 'topicals',
  accessory: 'accessories', accessories: 'accessories', pipes: 'accessories', storage: 'accessories', rolling: 'accessories', grinders: 'accessories', devices: 'accessories', batteries: 'accessories', cleaning: 'accessories', lighters: 'accessories',
}

const normalize = (value = '') => String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const baseUrl = import.meta.env?.BASE_URL || '/'
const nameIndex = new Map(LIBRARY.filter((photo) => photo.name).map((photo) => [normalize(photo.name), photo]))
const pools = new Map()
for (const photo of LIBRARY) {
  const pool = pools.get(photo.category) || []
  pool.push(photo)
  pools.set(photo.category, pool)
}

function stableIndex(value, length) {
  let hash = 0
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % length
}

// Returns an image from the local library only; callers should label it as representative.
export function photoFor(categoryName = '', productId = '', productName = '') {
  const exact = nameIndex.get(normalize(productName))
  if (exact) return `${baseUrl}${exact.file.slice(1)}`

  const category = CATEGORY_ALIASES[normalize(categoryName)]
  // Some Sweed catalogs have many leaf categories with no matching library pool (e.g. hemp or pet).
  // Use a stable general-library image rather than leaving the product without any image.
  const list = pools.get(category) || LIBRARY
  if (!list.length) return ''
  return `${baseUrl}${list[stableIndex(productId || productName, list.length)].file.slice(1)}`
}
