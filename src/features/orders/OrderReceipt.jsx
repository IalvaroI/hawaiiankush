import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { money, receiptValue } from '../../lib/format.js'

// The store's receipt lines, with amounts in the shop's money format. A group opens to show its breakdown.
export function OrderReceipt({ receipt }) {
  const lines = receipt?.items || []
  return (
    <section className="ord-panel" aria-labelledby="ord-receipt-title">
      <h2 id="ord-receipt-title">Receipt</h2>
      <ul className="ord-receipt">
        {lines.map((line, index) => (line?.type === 'group' || Array.isArray(line?.items)
          ? <ReceiptGroup key={index} line={line} />
          : <ReceiptRow key={index} title={line?.title} value={line?.value} />))}
      </ul>
      <div className="ord-receipt-total">
        <span>Total</span>
        <strong>{money(receipt?.total)}</strong>
      </div>
    </section>
  )
}

function ReceiptRow({ title, value, nested = false }) {
  return (
    <li className={nested ? 'ord-receipt-nested-row' : 'ord-receipt-row'}>
      <span>{title}</span>
      <span className="ord-receipt-value">{receiptValue(value)}</span>
    </li>
  )
}

function ReceiptGroup({ line }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <li className="ord-receipt-group">
      <button type="button" className="ord-receipt-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <ChevronDown size={16} aria-hidden="true" className={open ? 'ord-chevron is-open' : 'ord-chevron'} />
        <span>{line.title}</span>
        <span className="ord-receipt-value">{receiptValue(line.value)}</span>
      </button>
      <ul id={panelId} className="ord-receipt-nested" hidden={!open}>
        {(line.items || []).map((nested, index) => <ReceiptRow key={index} title={nested?.title} value={nested?.value} nested />)}
      </ul>
    </li>
  )
}
