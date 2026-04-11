'use client'

import type { Conversation } from '@/lib/types'
import ReplyBox from '@/components/shared/reply-box'

interface LeadReplyBoxProps {
  placeId: string
  onNewMessage: (conv: Conversation) => void
}

export default function LeadReplyBox({ placeId, onNewMessage }: LeadReplyBoxProps) {
  return <ReplyBox placeId={placeId} onNewMessage={onNewMessage} />
}
