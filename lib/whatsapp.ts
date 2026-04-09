function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  const clean = digits.startsWith('0') ? digits.slice(1) : digits
  return `55${clean}`
}

export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  if (!process.env.EVOLUTION_API_URL) return false
  const cleanPhone = normalizePhone(phone)
  try {
    await fetch(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVOLUTION_API_KEY ?? '',
        },
        body: JSON.stringify({ number: cleanPhone, textMessage: { text } }),
      },
    )
    return true
  } catch {
    return false
  }
}
