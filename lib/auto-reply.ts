/**
 * Detects if a message is an automatic/bot reply based on common patterns.
 * Returns true if the message looks like an automated response.
 */

const AUTO_REPLY_PATTERNS: RegExp[] = [
  // Greeting + "we'll get back to you" patterns (pt-BR)
  /obrigad[oa]\s+(pelo|por)\s+(seu\s+)?(contato|mensagem)/i,
  /retornaremos\s+(em\s+breve|o\s+mais\s+rápido)/i,
  /em\s+breve\s+(entraremos|retornaremos|responderemos)/i,
  /entraremos\s+em\s+contato/i,
  /responderemos\s+(em\s+breve|o\s+mais)/i,
  /aguarde\s+(nosso\s+)?(retorno|contato|resposta)/i,
  /sua\s+mensagem\s+foi\s+recebida/i,
  /recebemos\s+sua\s+(mensagem|solicitação)/i,

  // Business hours patterns
  /hor[áa]rio\s+de\s+(atendimento|funcionamento)/i,
  /nosso\s+hor[áa]rio/i,
  /fora\s+do\s+(hor[áa]rio|expediente)/i,
  /segunda\s+a\s+sexta/i,
  /seg\s+(a|à)\s+sex/i,
  /das\s+\d{1,2}h?\s*(às?|a)\s*\d{1,2}h/i,

  // Greeting + "we'll get back to you" patterns (English)
  /thank\s+you\s+for\s+(contacting|reaching|your\s+message)/i,
  /we('ll|\s+will)\s+(get\s+back|respond|reply)\s+(to\s+you\s+)?shortly/i,
  /your\s+(message|inquiry)\s+(has\s+been|was)\s+received/i,
  /out\s+of\s+office/i,
  /auto[\s-]?reply/i,
  /automatic\s+(response|reply)/i,
  /business\s+hours/i,

  // Common WhatsApp Business auto-reply markers
  /mensagem\s+autom[áa]tica/i,
  /resposta\s+autom[áa]tica/i,
  /estamos\s+(fechados?|indispon[íi]veis)/i,
  /no\s+momento\s+n[ãa]o\s+(estamos|podemos)/i,
]

export function isAutoReply(message: string): boolean {
  return AUTO_REPLY_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Check if a reply came suspiciously fast (< 3 seconds) after our message,
 * which strongly suggests an automated response.
 */
export function isInstantReply(
  replyTimestamp: string | number,
  lastOutboundTimestamp: string | null,
): boolean {
  if (!lastOutboundTimestamp) return false
  const replyTime = typeof replyTimestamp === 'number'
    ? replyTimestamp * 1000
    : new Date(replyTimestamp).getTime()
  const outboundTime = new Date(lastOutboundTimestamp).getTime()
  const diffMs = replyTime - outboundTime
  // Reply within 3 seconds of our message → almost certainly automated
  return diffMs >= 0 && diffMs < 3_000
}
