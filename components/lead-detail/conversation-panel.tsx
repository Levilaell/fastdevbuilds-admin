'use client'

import { useState } from 'react'
import type { Conversation } from '@/lib/types'
import ConversationHistory from './conversation-history'
import ReplyBox from './reply-box'

interface ConversationPanelProps {
  placeId: string
  initialConversations: Conversation[]
  defaultChannel: 'whatsapp' | 'email'
}

export default function ConversationPanel({
  placeId,
  initialConversations,
  defaultChannel,
}: ConversationPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)

  function handleNewMessage(conv: Conversation) {
    setConversations((prev) => [...prev, conv])
  }

  return (
    <div className="flex flex-col h-full">
      <ConversationHistory conversations={conversations} />
      <ReplyBox
        placeId={placeId}
        defaultChannel={defaultChannel}
        onNewMessage={handleNewMessage}
      />
    </div>
  )
}
