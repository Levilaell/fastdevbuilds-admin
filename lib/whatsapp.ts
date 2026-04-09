function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits
  const clean = digits.startsWith('0') ? digits.slice(1) : digits
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`
  return digits
}

export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const url = process.env.EVOLUTION_API_URL
  const instance = process.env.EVOLUTION_INSTANCE
  if (!url) {
    console.error('[whatsapp] EVOLUTION_API_URL not configured')
    return false
  }
  const cleanPhone = normalizePhone(phone)
  const endpoint = `${url}/message/sendText/${instance}`
  const payload = { number: cleanPhone, textMessage: { text } }
  console.log('[whatsapp] sending to', cleanPhone, 'via', endpoint)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EVOLUTION_API_KEY ?? '',
      },
      body: JSON.stringify(payload),
    })
    const body = await res.text()
    console.log('[whatsapp] status:', res.status, 'body:', body.slice(0, 300))
    return res.ok
  } catch (err) {
    console.error('[whatsapp] fetch error:', err instanceof Error ? err.message : err)
    return false
  }
}
