/**
 * Detects if a message is an automatic/bot reply based on common patterns.
 * Returns true if the message looks like an automated response.
 */

const AUTO_REPLY_PATTERNS: RegExp[] = [
  // Combined greeting + "we'll get back to you" — requires BOTH parts to match
  // to avoid false positives from short genuine replies like "Obrigado pelo contato"
  /obrigad[oa]\s+(pelo|por)\s+(seu\s+)?(contato|mensagem).{0,40}(retorn|respond|breve|hor[áa]rio)/i,
  /retornaremos\s+(em\s+breve|o\s+mais\s+rápido)/i,
  /em\s+breve\s+(entraremos|retornaremos|responderemos)/i,
  /entraremos\s+em\s+contato.{0,30}(breve|hor[áa]rio|aguarde)/i,
  /responderemos\s+(em\s+breve|o\s+mais)/i,
  /aguarde\s+(nosso\s+)?(retorno|contato|resposta)/i,
  /sua\s+mensagem\s+foi\s+recebida/i,
  /recebemos\s+sua\s+(mensagem|solicitação)/i,

  // Business hours patterns (strong auto-reply signal by themselves)
  /hor[áa]rio\s+de\s+(atendimento|funcionamento)/i,
  /fora\s+do\s+(hor[áa]rio|expediente)/i,
  /das\s+\d{1,2}h?\s*(às?|a)\s*\d{1,2}h/i,

  // Explicit auto-reply markers (English + Portuguese)
  /auto[\s-]?reply/i,
  /automatic\s+(response|reply)/i,
  /mensagem\s+autom[áa]tica/i,
  /resposta\s+autom[áa]tica/i,
  /out\s+of\s+office/i,

  // Greeting + "we'll get back to you" patterns (English)
  /thank\s+you\s+for\s+(contacting|reaching|your\s+message).{0,40}(shortly|soon|get\s+back)/i,
  /your\s+(message|inquiry)\s+(has\s+been|was)\s+received/i,

  // Common WhatsApp Business auto-reply markers
  /estamos\s+(fechados?|indispon[íi]veis)/i,
  /no\s+momento\s+n[ãa]o\s+(estamos|podemos)/i,
]

export function isAutoReply(message: string): boolean {
  // Short messages (< 20 chars) are almost never auto-replies
  if (message.trim().length < 20) return false
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
