/**
 * Detects if a message is an automatic/bot reply.
 *
 * Strategy: a single regex match against a curated list of patterns that
 * only auto-responders use. If any pattern fires, the message is flagged.
 * Kept conservative — prefers false negatives (human tagged as human) over
 * false positives (human tagged as bot) because the cost asymmetry favors
 * letting a bot through than stalling a real lead.
 */

const STRONG_PATTERNS: RegExp[] = [
  // Greeting + "we'll get back" — requires both halves to avoid flagging
  // genuine short replies like "Obrigado pelo contato"
  /obrigad[oa]\s+(pelo|por)\s+(seu\s+)?(contato|mensagem).{0,40}(retorn|respond|breve|hor[áa]rio)/i,
  /retornaremos\s+(em\s+breve|o\s+mais\s+rápido|seu|sua|assim)/i,
  /em\s+breve\s+(entraremos|retornaremos|responderemos)/i,
  /entraremos\s+em\s+contato.{0,30}(breve|hor[áa]rio|aguarde|poss[íi]vel)/i,
  /responderemos\s+(em\s+breve|o\s+mais|assim\s+que)/i,
  /aguarde\s+(nosso\s+)?(retorno|contato|resposta)/i,
  /sua\s+mensagem\s+foi\s+recebida/i,
  /recebemos\s+sua\s+(mensagem|solicitação)/i,

  // Generic virtual-attendant greetings (short, but unambiguous)
  /como\s+(podemos|posso)\s+(te\s+)?ajudar/i,
  /em\s+que\s+(podemos|posso)\s+(te\s+)?ajudar/i,
  /how\s+(can|may)\s+(we|I)\s+help\s+you/i,
  /how\s+may\s+I\s+assist/i,

  // Mailbox / leave-a-message prompts
  /deixe\s+(sua|seu)\s+(mensagem|recado)/i,
  /envie\s+(sua|seu)\s+(mensagem|recado)/i,
  /por\s+favor,?\s+(deixe|envie)\s+(sua|seu)\s+(mensagem|recado)/i,
  /leave\s+(a|your)\s+message/i,

  // Business hours
  /hor[áa]rio\s+de\s+(atendimento|funcionamento|expediente)/i,
  /fora\s+do\s+(hor[áa]rio|expediente)/i,
  /das\s+\d{1,2}h?\s*(às?|a)\s*\d{1,2}h/i,
  /nosso\s+hor[áa]rio/i,
  /our\s+(business|office)\s+hours\s+are/i,
  /we(?:\s+are|'re)\s+(currently\s+)?closed/i,

  // Explicit auto-reply markers
  /auto[\s-]?reply/i,
  /automatic\s+(response|reply)/i,
  /mensagem\s+autom[áa]tica/i,
  /resposta\s+autom[áa]tica/i,
  /atendimento\s+automatizado/i,
  /out\s+of\s+office/i,

  // English greeting + "we'll get back"
  /thank\s+you\s+for\s+(contacting|reaching|your\s+message).{0,40}(shortly|soon|get\s+back)/i,
  /your\s+(message|inquiry)\s+(has\s+been|was)\s+received/i,

  // Closed / unavailable
  /estamos\s+(fechados?|indispon[íi]veis)/i,
  /no\s+momento\s+n[ãa]o\s+(estamos|podemos)/i,

  // WhatsApp Business greeting/menu markers
  /agradece\s+seu\s+contato/i,
  /enquanto\s+aguarda\s+(meu|nosso)\s+retorno/i,
  /em\s+atendimento\s*[-–—]\s*(deixe|envie)/i,
  /quer\s+(saber|agendar).{0,20}(hor[áa]rio|link|funciona)/i,

  // Virtual assistant self-identification
  /sou\s+(a|o|seu)\s+(assistente|atendente)\s+(virtual|digital|automatizad[oa])/i,
  /i\s+am\s+(a|the|your)\s+virtual\s+assistant/i,

  // English email auto-replies
  /I('m|\s+am)\s+(currently\s+)?(out|away|on\s+vacation|on\s+leave|unavailable)/i,
  /I\s+will\s+be\s+out\s+of\s+the\s+office/i,
  /this\s+is\s+an?\s+auto(mated|matic)/i,
  /do\s+not\s+reply\s+to\s+this\s+email/i,
  /undeliverable|undelivered|delivery\s+(failure|failed)|bounced?\s+back/i,
  /this\s+mailbox\s+is\s+not\s+monitored/i,
  /we('ve|\s+have)\s+received\s+your\s+(email|message|inquiry)/i,
  /we\s+will\s+(get\s+back|respond|reply)\s+(to\s+you\s+)?(shortly|soon|within)/i,
  /currently\s+closed/i,
];

export function isAutoReply(message: string): boolean {
  const msg = message.trim();
  if (!msg) return false;
  return STRONG_PATTERNS.some((p) => p.test(msg));
}

/**
 * Reply within 3 seconds of our outbound → almost certainly automated.
 * Standalone hard signal; useful when content alone isn't conclusive.
 */
export function isInstantReply(
  replyTimestamp: string | number,
  lastOutboundTimestamp: string | null,
): boolean {
  if (!lastOutboundTimestamp) return false;
  const replyTime =
    typeof replyTimestamp === "number"
      ? replyTimestamp * 1000
      : new Date(replyTimestamp).getTime();
  const outboundTime = new Date(lastOutboundTimestamp).getTime();
  const diffMs = replyTime - outboundTime;
  return diffMs >= 0 && diffMs < 3_000;
}
