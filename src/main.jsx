import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App.jsx'

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)

// The service worker (public/sw.js) makes the shop installable and gives it an offline page. Production builds only:
// in development it would serve stale build files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}
