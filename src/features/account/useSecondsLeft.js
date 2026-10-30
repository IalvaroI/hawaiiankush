import { useEffect, useReducer } from 'react'

// Whole seconds until an ISO time (0 once it has passed). Re-renders twice a second while counting down.
export function useSecondsLeft(untilIso) {
  const until = untilIso ? Date.parse(untilIso) : NaN
  const [, tick] = useReducer((count) => count + 1, 0)

  useEffect(() => {
    if (!(until > Date.now())) return undefined
    const timer = setInterval(() => {
      tick()
      if (Date.now() >= until) clearInterval(timer)
    }, 500)
    return () => clearInterval(timer)
  }, [until])

  if (!Number.isFinite(until)) return 0
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}
