import { createServiceClient } from '@/lib/supabase/service'

// Store last 20 webhook payloads in memory for debugging
const webhookLog: { time: string; event: string; fromMe: boolean; remoteJid: string; hasText: boolean; messageKeys: string; raw: unknown }[] = []

export function logWebhook(payload: unknown) {
  const body = payload as Record<string, unknown>
  const data = body.data as Record<string, unknown> | undefined
  const key = data?.key as Record<string, unknown> | undefined
  const message = data?.message as Record<string, unknown> | undefined

  webhookLog.unshift({
    time: new Date().toISOString(),
    event: String(body.event ?? ''),
    fromMe: !!(key?.fromMe),
    remoteJid: String(key?.remoteJid ?? ''),
    hasText: !!(
      (message as Record<string, unknown>)?.conversation ??
      (message as Record<string, string | undefined>)?.extendedTextMessage
    ),
    messageKeys: message ? Object.keys(message).join(',') : 'none',
    raw: body,
  })

  if (webhookLog.length > 20) webhookLog.length = 20
}

export { webhookLog }

export async function GET() {
  // Also check recent conversations to compare
  const supabase = createServiceClient()
  const { data: recentConvs } = await supabase
    .from('conversations')
    .select('place_id, direction, channel, message, sent_at')
    .order('sent_at', { ascending: false })
    .limit(10)

  return Response.json({
    webhook_events: webhookLog,
    recent_conversations: recentConvs ?? [],
    note: 'Se webhook_events está vazio, a Evolution API não está enviando eventos para este endpoint. Verifique a configuração de webhook na Evolution API.',
  })
}
