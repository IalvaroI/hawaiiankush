import { useEffect, useRef } from 'react'

// Page scroll lock shared by every open dialog. iOS Safari ignores overflow: hidden on the body (the page behind keeps
// scrolling, and a swipe in the panel can move the page instead), so the body is pinned in place at its scroll
// position and put back exactly there when the last dialog closes.
let locks = 0
let saved = null

function lockScroll() {
  locks += 1
  if (locks > 1) return
  const { style } = document.body
  saved = { y: window.scrollY, position: style.position, top: style.top, left: style.left, right: style.right, width: style.width, overflow: style.overflow }
  Object.assign(style, { position: 'fixed', top: `-${saved.y}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' })
}

function unlockScroll() {
  locks = Math.max(0, locks - 1)
  if (locks || !saved) return
  const { y, ...previous } = saved
  saved = null
  Object.assign(document.body.style, previous)
  window.scrollTo(0, y)
}

// Escape closes, focus moves into the dialog and returns to the trigger, Tab stays inside.
export function useDialog(open, onClose, ref) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement
    const focusable = () => [...(ref.current?.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, summary') || [])]
    focusable()[0]?.focus()
    lockScroll()
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      // Focus that fell out of the dialog (its control was removed, say) comes back in rather than onto the page behind.
      const inside = ref.current?.contains(document.activeElement)
      if (!inside) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      unlockScroll()
      // The mobile bag bar unmounts while a dialog is open, so fall back to the header bag button.
      // preventScroll: the page is already back at its place; focusing must not jump it to the trigger.
      ;(trigger?.isConnected && trigger !== document.body ? trigger : document.querySelector('.bag-button'))?.focus?.({ preventScroll: true })
    }
  }, [open, ref])
}
