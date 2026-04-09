import type { SupabaseClient } from '@supabase/supabase-js'
import type { Conversation } from '@/lib/types'

export async function getRecentConversations(
  supabase: SupabaseClient,
  placeId: string,
  limit: number,
): Promise<Conversation[]> {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('place_id', placeId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as Conversation[]).reverse()
}
