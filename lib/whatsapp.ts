export async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  if (!process.env.EVOLUTION_API_URL) return false
  const cleanPhone = phone.replace(/\D/g, '')
  try {
    await fetch(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EVOLUTION_API_KEY ?? '',
        },
        body: JSON.stringify({ number: cleanPhone, text }),
      },
    )
    return true
  } catch {
    return false
  }
}
