import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { useStore } from '../store-context'

export function Toast() {
  const { notice } = useStore()
  if (!notice) return null
  return <div className="message-notice" role="status"><Check size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />{notice}</div>
}

export function Modal({ title, children, actions, onClose }: {
  title: string
  children: React.ReactNode
  actions: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{title}</h2>
        <p>{children}</p>
        <div className="modal-actions">{actions}</div>
      </section>
    </div>
  )
}
