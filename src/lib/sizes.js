// Sizes from smallest to largest (1g, 3.5g, 7g; 5mg, 10×10mg), whatever order the store lists them in. A size is its
// total amount: item size × items in the pack, in a common unit per kind (weight in grams, volume in millilitres).
// Sizes the store gave no package for, or a different kind of measure, keep their order after the measured ones.
const WEIGHT = { milligram: 0.001, gram: 1, ounce: 28.3495 }
const VOLUME = { milliliter: 1, fluidOunce: 29.5735 }

function amountOf(variant) {
  const size = variant?.package?.itemSize
  const value = Number(size?.value)
  if (!Number.isFinite(value) || value <= 0) return null
  const count = Number(variant.package.itemsCount) > 0 ? Number(variant.package.itemsCount) : 1
  if (size.uom in WEIGHT) return { kind: 'weight', total: value * count * WEIGHT[size.uom] }
  if (size.uom in VOLUME) return { kind: 'volume', total: value * count * VOLUME[size.uom] }
  if (size.uom === 'each') return { kind: 'each', total: value * count }
  return null
}

export function bySize(variants) {
  const list = Array.isArray(variants) ? variants : []
  const amounts = list.map(amountOf)
  // Only sizes of the product's main kind (the first measured one) are ordered by amount.
  const kind = amounts.find(Boolean)?.kind
  return list
    .map((variant, index) => ({ variant, index, amount: amounts[index] && amounts[index].kind === kind ? amounts[index].total : null }))
    .sort((a, b) => (a.amount === null) - (b.amount === null) || (a.amount ?? 0) - (b.amount ?? 0) || a.index - b.index)
    .map((entry) => entry.variant)
}
