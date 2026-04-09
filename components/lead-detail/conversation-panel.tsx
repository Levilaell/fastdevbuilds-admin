'use client'

import { useState } from 'react'
import type { Conversation, AiSuggestion } from '@/lib/types'
import ConversationHistory from './conversation-history'
import ReplyBox from './reply-box'
import AiSuggestionCard from '@/components/ai-suggestion-card'

interface ConversationPanelProps {
  placeId: string
  initialConversations: Conversation[]
  defaultChannel: 'whatsapp' | 'email'
  initialSuggestion?: AiSuggestion | null
}

export default function ConversationPanel({
  placeId,
  initialConversations,
  defaultChannel,
  initialSuggestion,
}: ConversationPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(initialSuggestion ?? null)

  function handleNewMessage(conv: Conversation) {
    setConversations((prev) => [...prev, conv])
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationHistory conversations={conversations} />
      {suggestion && (
        <AiSuggestionCard
          suggestion={suggestion}
          onDismiss={() => setSuggestion(null)}
          onSent={(conv) => {
            setConversations((prev) => [...prev, conv])
            setSuggestion(null)
          }}
        />
      )}
      <ReplyBox
        placeId={placeId}
        defaultChannel={defaultChannel}
        onNewMessage={handleNewMessage}
      />
    </div>
  )
}
