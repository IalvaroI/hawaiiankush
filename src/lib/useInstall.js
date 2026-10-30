import { useEffect, useState } from 'react'

// "Install app": Chrome, Edge and Android hand the shop an install prompt (beforeinstallprompt), which the button
// opens. iPhone and iPad Safari never do, so there the button explains Add to Home Screen instead. Nothing shows once
// the shop runs installed (standalone).
let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferred = event; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIosSafari() {
  const ua = window.navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

// Returns { mode: 'prompt' | 'ios' | null, install } — null when there is nothing to offer.
export function useInstall() {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const listener = () => setVersion((count) => count + 1)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])
  if (typeof window === 'undefined' || isStandalone()) return { mode: null, install: () => {} }
  if (deferred) {
    return {
      mode: 'prompt',
      install: async () => {
        const event = deferred
        deferred = null
        notify()
        await event.prompt()
      },
    }
  }
  return { mode: isIosSafari() ? 'ios' : null, install: () => {} }
}
