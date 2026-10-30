import { useMemo } from 'react'
import { Clock, Loader2 } from 'lucide-react'
import { StepShell } from './StepShell.jsx'
import { dayLabel, groupTimeWindows, windowRange, windowSummary } from './checkoutDraft.js'

export function TimeStep({ number, open, done, draft, updateDraft, windows, busy, error, onContinue, onEdit }) {
  const groups = useMemo(() => groupTimeWindows(windows.items), [windows.items])
  const empty = !windows.items?.length
  const summary = done ? (draft.timeWindow ? windowSummary(draft.timeWindow) : 'No specific time') : ''

  return (
    <StepShell id="time" number={number} title="Time" summary={summary} open={open} done={done} onEdit={onEdit}>
      {empty ? (
        <p className="co-notice" role="status">No time slots available right now.</p>
      ) : (
        groups.map((group) => (
          <fieldset className="co-group-fields" key={group.date}>
            <legend>{dayLabel(group.date)}</legend>
            <div className="co-options">
              {group.windows.map((window) => {
                const selected = draft.timeWindow?.id === window.id
                return (
                  <label key={window.id} className={`co-option${selected ? ' is-selected' : ''}`}>
                    <input type="radio" name="co-time" value={window.id} checked={selected} onChange={() => updateDraft({ timeWindow: window })} />
                    <Clock size={20} aria-hidden="true" className="co-option-icon" />
                    <span className="co-option-text">
                      <strong>{window.isAsap ? 'As soon as possible' : windowRange(window.interval)}</strong>
                      {window.isAsap && <small>{windowRange(window.interval)}</small>}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))
      )}
      {error && <p className="co-alert" role="alert">{error}</p>}
      <button className="primary-button wide" type="button" disabled={busy !== '' || empty} onClick={onContinue}>
        {busy === 'time' && <Loader2 className="spin" size={18} aria-hidden="true" />} Continue
      </button>
    </StepShell>
  )
}
