'use client'

import type { LeadStatus, ProjectStatus } from '@/lib/types'

interface WorkflowStep {
  number: number
  label: string
  active: boolean
  done: boolean
}

function getWorkflowSteps(
  leadStatus: LeadStatus,
  projectStatus: ProjectStatus | null,
): { steps: WorkflowStep[]; currentStep: number; nextAction: string | null } {
  const allSteps = [
    'Prospectado',
    'Enviado',
    'Aceitou',
    'Preview enviado',
    'Ajustando',
    'Versão final enviada',
    'Pago',
  ]

  let currentStep = 1

  // Project-side steps take precedence — a project in "adjusting" means the
  // lead has long since replied, even if lead.status still says 'replied'.
  if (leadStatus === 'closed' || projectStatus === 'paid') currentStep = 7
  else if (projectStatus === 'delivered') currentStep = 6
  else if (projectStatus === 'adjusting') currentStep = 5
  else if (projectStatus === 'preview_sent') currentStep = 4
  else if (projectStatus === 'approved') currentStep = 3
  else if (leadStatus === 'negotiating' || leadStatus === 'replied') currentStep = 3
  else if (leadStatus === 'sent') currentStep = 2
  else if (leadStatus === 'prospected') currentStep = 1

  const steps = allSteps.map((label, i) => ({
    number: i + 1,
    label,
    active: i + 1 === currentStep,
    done: i + 1 < currentStep,
  }))

  let nextAction: string | null = null
  switch (currentStep) {
    case 1: nextAction = 'Enviar mensagem de prospecção'; break
    case 2: nextAction = 'Aguardando resposta do lead'; break
    case 3: nextAction = 'Criar projeto e enviar preview'; break
    case 4: nextAction = 'Aguardando feedback do cliente'; break
    case 5: nextAction = 'Aplicar ajustes e enviar versão final'; break
    case 6: nextAction = 'Aguardando pagamento'; break
    case 7: nextAction = null; break
  }

  return { steps, currentStep, nextAction }
}

interface Props {
  leadStatus: LeadStatus
  projectStatus: ProjectStatus | null
}

export default function WorkflowBar({ leadStatus, projectStatus }: Props) {
  const { steps, currentStep, nextAction } = getWorkflowSteps(leadStatus, projectStatus)

  if (leadStatus === 'lost') {
    return (
      <div className="px-3 py-2 bg-danger/5 border-b border-danger/20">
        <span className="text-[10px] text-danger font-medium">Lead perdido</span>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 bg-card/50 border-b border-border space-y-1.5">
      {/* Step indicators */}
      <div className="flex items-center gap-0.5">
        {steps.map((step) => (
          <div
            key={step.number}
            title={`${step.number}. ${step.label}`}
            className={`h-1 flex-1 rounded-full ${
              step.done
                ? 'bg-success'
                : step.active
                  ? 'bg-accent'
                  : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* Current step + next action */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">
          Etapa {currentStep}/7: <span className="text-text/80">{steps[currentStep - 1]?.label}</span>
        </span>
        {nextAction && (
          <span className="text-[10px] text-accent font-medium truncate">
            → {nextAction}
          </span>
        )}
      </div>
    </div>
  )
}
