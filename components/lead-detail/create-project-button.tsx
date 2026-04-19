'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CreateProjectModal from './create-project-modal'

interface Props {
  placeId: string
  businessName: string
}

export default function CreateProjectButton({ placeId, businessName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-xs font-semibold text-text uppercase tracking-wide mb-3">
        Projeto
      </h2>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white"
      >
        Criar projeto
      </button>

      {open && (
        <CreateProjectModal
          placeId={placeId}
          businessName={businessName}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
