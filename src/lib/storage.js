import { EMPTY_GUEST, GUEST_KEY } from '../config.js'

export function storageGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function storageSet(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

export function sessionGet(key) {
  try { return sessionStorage.getItem(key) } catch { return null }
}

export function sessionSet(key, value) {
  try { value == null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

// Contact details typed at checkout, kept for the tab so a refresh does not lose them.
export function savedGuest() {
  try { return { ...EMPTY_GUEST, ...JSON.parse(sessionGet(GUEST_KEY) || '{}') } }
  catch { return EMPTY_GUEST }
}
