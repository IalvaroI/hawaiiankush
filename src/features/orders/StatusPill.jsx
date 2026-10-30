import { statusInfo } from './orderModel.js'

// The status is written out, so it never depends on colour alone.
export function StatusPill({ status }) {
  const info = statusInfo(status)
  return <span className={`ord-pill tone-${info.tone}`}>{info.label}</span>
}
