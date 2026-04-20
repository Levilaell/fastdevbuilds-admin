'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusSelect from './status-select'
import MarkLostModal from './mark-lost-modal'
import type { LeadStatus } from '@/lib/types'

interface Props {
  placeId: string
  businessName: string
  initialStatus: LeadStatus
}

export default function LeadStatusControls({
  placeId,
  businessName,
  initialStatus,
}: Props) {
  const router = useRouter()
  const [showLostModal, setShowLostModal] = useState(false)
  const isLost = initialStatus === 'lost'

  function handleMarked() {
    setShowLostModal(false)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <StatusSelect placeId={placeId} initialStatus={initialStatus} />

      {!isLost && (
        <button
          type="button"
          onClick={() => setShowLostModal(true)}
          className="w-full text-xs text-danger/80 hover:text-danger transition-colors py-1.5 border border-danger/20 hover:border-danger/50 rounded-lg"
        >
          × Marcar como lost
        </button>
      )}

      {showLostModal && (
        <MarkLostModal
          placeId={placeId}
          businessName={businessName}
          onClose={() => setShowLostModal(false)}
          onMarked={handleMarked}
        />
      )}
    </div>
  )
}
