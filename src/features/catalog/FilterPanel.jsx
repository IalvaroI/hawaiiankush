import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FILTER_LABELS, OPTIONS_SHOWN, RANGE_UNITS } from '../../config.js'
import { useDialog } from '../../hooks/useDialog.js'
import { isPlaceholder, rangeBounds } from '../../lib/format.js'

export function OptionsFilter({ filter, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const options = filter.options.filter((option) => !isPlaceholder(option.name))
  // Selected options stay visible even while the list is collapsed.
  const shown = expanded ? options : options.filter((option, index) => index < OPTIONS_SHOWN || selected.includes(String(option.value)))
  return (
    <div className="option-list">
      {shown.map((option) => (
        <label className="check" key={String(option.value)}>
          <input type="checkbox" checked={selected.includes(String(option.value))} onChange={() => onToggle(filter.key, option.value)} />
          <span>{option.name}</span>
        </label>
      ))}
      {options.length > OPTIONS_SHOWN && (
        <button type="button" className="text-button" onClick={() => setExpanded((current) => !current)}>{expanded ? 'Show fewer' : `Show all ${options.length}`}</button>
      )}
    </div>
  )
}

export function RangeFilter({ filter, value, onRange }) {
  const bounds = rangeBounds(filter)
  const unit = RANGE_UNITS[filter.key] || { prefix: '', suffix: '' }
  const [draft, setDraft] = useState({ min: value?.[0] ?? '', max: value?.[1] ?? '' })
  useEffect(() => { setDraft({ min: value?.[0] ?? '', max: value?.[1] ?? '' }) }, [value?.[0], value?.[1]])
  const minNumber = draft.min === '' ? bounds.min : Number(draft.min)
  const maxNumber = draft.max === '' ? bounds.max : Number(draft.max)
  const invalid = minNumber > maxNumber
  function apply() {
    if (invalid) return
    const min = Math.max(bounds.min, Math.min(minNumber, bounds.max))
    const max = Math.min(bounds.max, Math.max(maxNumber, bounds.min))
    onRange(filter.key, min === bounds.min && max === bounds.max ? null : [min, max])
  }
  const field = (key, label) => (
    <label className="range-field">
      <span>{label}</span>
      <span className="range-input">
        {unit.prefix && <span aria-hidden="true">{unit.prefix}</span>}
        <input type="number" inputMode="decimal" min={bounds.min} max={bounds.max} placeholder={String(key === 'min' ? bounds.min : bounds.max)} value={draft[key]}
          aria-invalid={invalid || undefined}
          onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
          onBlur={apply} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); apply() } }} />
        {unit.suffix && <span aria-hidden="true">{unit.suffix}</span>}
      </span>
    </label>
  )
  return (
    <div className="range">
      <div className="range-fields">{field('min', 'Min')}{field('max', 'Max')}</div>
      {invalid && <p className="field-error" role="alert">Min must be lower than max.</p>}
    </div>
  )
}

export function FilterPanel({ open, onClose, filters, selected, count, totalItems, loading, onToggle, onRange, onClear }) {
  const ref = useRef(null)
  useDialog(open, onClose, ref)
  if (!open) return null
  return (
    <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="filters-title" ref={ref}>
        <div className="panel-header">
          <h2 id="filters-title">Filters</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close filters"><X size={20} /></button>
        </div>
        <div className="filter-sections">
          {filters.map((filter, index) => {
            const values = selected[filter.key] || []
            return (
              <details className="filter-section" key={filter.key} open={index < 4 || values.length > 0}>
                <summary>
                  <span>{FILTER_LABELS[filter.key] || filter.name}</span>
                  {values.length > 0 && <span className="count-badge">{filter.type === 'range' ? 1 : values.length}</span>}
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                {filter.type === 'range'
                  ? <RangeFilter filter={filter} value={values.length ? values : null} onRange={onRange} />
                  : <OptionsFilter filter={filter} selected={values} onToggle={onToggle} />}
              </details>
            )
          })}
        </div>
        <div className="panel-footer">
          <button className="secondary-button" type="button" onClick={onClear} disabled={!count}>Clear filters</button>
          <button className="primary-button" type="button" onClick={onClose}>{loading ? 'Show results' : `Show ${totalItems.toLocaleString('en-US')} ${totalItems === 1 ? 'product' : 'products'}`}</button>
        </div>
      </aside>
    </div>
  )
}
