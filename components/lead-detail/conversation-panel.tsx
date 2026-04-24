'use client'

import { useState } from 'react'
import type { Conversation } from '@/lib/types'
import ConversationHistory from './conversation-history'
import ReplyBox from '@/components/shared/reply-box'

interface ConversationPanelProps {
  placeId: string
  initialConversations: Conversation[]
  channel?: 'whatsapp' | 'email' | 'sms'
}

export default function ConversationPanel({
  placeId,
  initialConversations,
  channel,
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
        onNewMessage={handleNewMessage}
        channel={channel}
      />
    </div>
  )
}
