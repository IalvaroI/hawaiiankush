import { useRef } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../hooks/useDialog.js'
import { Sidebar } from './Sidebar.jsx'

// Navigation as an overlay for widths below 900px. Mounted only while open, so the dialog hook can run on mount.
export function MobileNav({ storeName, logo, staffPickId, onClose }) {
  const ref = useRef(null)
  useDialog(true, onClose, ref)
  return (
    <div className="backdrop nav-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="nav-sheet" role="dialog" aria-modal="true" aria-label="Site navigation" ref={ref}>
        <button type="button" className="icon-button nav-close" aria-label="Close menu" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        <Sidebar storeName={storeName} logo={logo} staffPickId={staffPickId} onNavigate={onClose} />
      </div>
    </div>
  )
}
