import { useEffect, useState } from 'react'
import { DEMO_MODE, STORE_ID } from '../config.js'
import { api } from '../api/client.js'

export function useStore() {
  const [store, setStore] = useState(null)
  useEffect(() => {
    if (DEMO_MODE || !STORE_ID) return
    let active = true
    api('').then((result) => { if (active) setStore(result?.store || null) }).catch(() => {})
    return () => { active = false }
  }, [])
  return store
}
