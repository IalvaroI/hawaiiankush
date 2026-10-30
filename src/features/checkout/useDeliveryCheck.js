import { useEffect, useState } from 'react'
import { api } from '../../api/client.js'

// Asks the store whether it delivers to this address. Waits for a usable address with coordinates, then pauses briefly
// so typing does not send a request per key. An answer for an address the shopper has since changed is ignored.
export function useDeliveryCheck({ address, secondaryAddress, coordinates, enabled }) {
  const street = String(address || '').trim()
  const apartment = String(secondaryAddress || '').trim()
  const ready = Boolean(enabled && street.length >= 5 && coordinates)
  const key = ready ? JSON.stringify([street, apartment, coordinates.latitude, coordinates.longitude]) : ''
  const [result, setResult] = useState({ key: '', status: 'idle', terms: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!key) return undefined
    let active = true
    // A retry or a new address starts from "checking", never from the previous verdict.
    setResult((current) => (current.key === key ? { key: '', status: 'checking', terms: null } : current))
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        'Location.Address': street,
        'Location.Coordinates.Latitude': String(coordinates.latitude),
        'Location.Coordinates.Longitude': String(coordinates.longitude),
      })
      if (apartment) params.set('Location.SecondaryAddress', apartment)
      try {
        const response = await api(`/delivery?${params}`)
        if (active) setResult({ key, status: response?.delivery?.availability || 'error', terms: response?.delivery?.terms || null })
      } catch {
        if (active) setResult({ key, status: 'error', terms: null })
      }
    }, 450)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // The key already encodes the address and coordinates; `street` and `apartment` are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const verdict = key && result.key === key ? result : null
  return { verdict, checking: Boolean(key) && !verdict, ready, retry: () => setAttempt((count) => count + 1) }
}
