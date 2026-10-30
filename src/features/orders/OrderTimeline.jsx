import { Check } from 'lucide-react'
import { timelineFor } from './orderModel.js'

const STATE_TEXT = { done: 'done', current: 'current step', upcoming: 'to come' }

// Pickup: Placed, Packing, Ready for pickup, Picked up. Delivery: Placed, Packing, Out for delivery, Delivered.
export function OrderTimeline({ order }) {
  const { steps, attention } = timelineFor(order)
  return (
    <ol className="ord-timeline">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`ord-step is-${step.state}${attention && step.state === 'current' ? ' is-attention' : ''}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="ord-step-dot" aria-hidden="true">{step.state === 'done' ? <Check size={14} /> : null}</span>
          <span className="ord-step-label">{step.label}</span>
          <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
        </li>
      ))}
    </ol>
  )
}
