import { useEffect, useState } from 'react'

function matches(query) {
  try { return typeof window !== 'undefined' && window.matchMedia(query).matches } catch { return false }
}

export function useMediaQuery(query) {
  const [value, setValue] = useState(() => matches(query))
  useEffect(() => {
    let mql
    try { mql = window.matchMedia(query) } catch { return undefined }
    const update = () => setValue(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return value
}
