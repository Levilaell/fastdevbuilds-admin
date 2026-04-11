'use client'

import type { LeadStatus, Project, ProjectStatus } from '@/lib/types'

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
  // Map the 13-step flow to current state
  const allSteps = [
    'Prospectado',
    'Enviado',
    'Respondeu',
    'IA sugeriu',
    'Negociando',
    'Escopo gerado',
    'Proposta enviada',
    'Cliente autorizou',
    'Em progresso',
    'Preview enviado',
    'Cliente aprovou',
    'PIX enviado',
    'Pago',
  ]

  let currentStep = 1

  // Determine current step based on lead + project status
  if (leadStatus === 'prospected') currentStep = 1
  else if (leadStatus === 'sent') currentStep = 2
  else if (leadStatus === 'replied') currentStep = 3
  else if (leadStatus === 'negotiating') currentStep = 5
  else if (leadStatus === 'scoped') {
    if (!projectStatus || projectStatus === 'scoped') currentStep = 6
    else if (projectStatus === 'approved') currentStep = 8
    else if (projectStatus === 'in_progress') currentStep = 9
    else if (projectStatus === 'delivered') currentStep = 10
    else if (projectStatus === 'client_approved') currentStep = 11
    else if (projectStatus === 'paid') currentStep = 13
  } else if (leadStatus === 'closed') currentStep = 13
  else if (leadStatus === 'pago') currentStep = 13

  const steps = allSteps.map((label, i) => ({
    number: i + 1,
    label,
    active: i + 1 === currentStep,
    done: i + 1 < currentStep,
  }))

  // Determine next action
  let nextAction: string | null = null
  switch (currentStep) {
    case 1: nextAction = 'Enviar mensagem de prospecção'; break
    case 2: nextAction = 'Aguardando resposta do lead'; break
    case 3: nextAction = 'Responder ao lead (sugestão IA disponível)'; break
    case 5: nextAction = 'Continuar conversa ou gerar escopo'; break
    case 6: nextAction = 'Revisar e enviar proposta'; break
    case 7: nextAction = 'Aguardando autorização do cliente'; break
    case 8: nextAction = 'Iniciar projeto (prompt gerado)'; break
    case 9: nextAction = 'Enviar link de preview'; break
    case 10: nextAction = 'Aguardando aprovação do cliente'; break
    case 11: nextAction = 'Enviar cobrança PIX'; break
    case 12: nextAction = 'Aguardando pagamento'; break
    case 13: nextAction = null; break
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
          Etapa {currentStep}/13: <span className="text-text/80">{steps[currentStep - 1]?.label}</span>
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
