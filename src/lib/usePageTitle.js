import { useEffect } from 'react'

// Each page names itself; nothing else writes document.title, so a late store load can't overwrite a page's title.
// Titles are "Page · Store"; a part that is still empty (the store name before it loads) is left out.
export function usePageTitle(title) {
  const text = String(title || '').split(' · ').map((part) => part.trim()).filter(Boolean).join(' · ')
  useEffect(() => { if (text) document.title = text }, [text])
}
