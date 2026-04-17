/**
 * Detects if a message is an automatic/bot reply.
 *
 * Two-tier design:
 *   1. STRONG patterns — a single match marks the message as bot,
 *      regardless of length. These are phrases only an auto-responder uses.
 *   2. Weak signals — each adds to a score; threshold >= 3 marks as bot.
 *      Kept conservative so short human replies never trip the heuristics.
 *
 * Length gate: short messages (< 20 chars) only bypass STRONG-pattern
 * matching — weak-signal scoring is skipped for them so normal "oi" /
 * "quem é" style replies never get flagged.
 */

// ── Tier 1: strong patterns (single match = bot) ───────────────────────────
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

// ── Tier 2: weak signals (combined score) ──────────────────────────────────
const MENU_PHRASES: RegExp[] = [
  /digite\s+[0-9]/i,
  /digite\s+(a\s+)?op[çc][ãa]o/i,
  /escolha\s+(uma|a)\s+op[çc][ãa]o/i,
  /selecione\s+(uma|a|o)\s+(op[çc][ãa]o|n[úu]mero)/i,
  /responda\s+com\s+[0-9]/i,
  /press\s+[0-9]/i,
  /reply\s+with\s+[0-9]/i,
  /choose\s+an\s+option/i,
];

const GENERIC_WELCOME: RegExp[] = [
  /bem[\s-]?vind[oa]\s+(à|ao|a|ao\s+nosso)/i,
  /ol[áa]!\s*(tudo\s+bem|seja\s+bem)/i,
  /welcome\s+to\s+\w+/i,
];

const SOCIAL_CTA: RegExp[] = [
  /instagram\.com\/[\w.]+/i,
  /siga[\s-]?nos\s+(no|em|@)/i,
  /nos\s+siga\s+(no|em)\s+(instagram|insta|@)/i,
  /follow\s+us\s+on\s+(instagram|facebook)/i,
];

/** Menu-style lines: "1 -", "1)", "1.", "1️⃣" on 2+ separate lines. */
function hasMenuStructure(msg: string): boolean {
  const lines = msg.split(/\r?\n/);
  const menuLines = lines.filter((l) =>
    /^[\s*>_\-•·]*(?:[0-9]{1,2}[\s.)\-–—:]|[1-9]\uFE0F?\u20E3)/.test(l.trim()),
  );
  return menuLines.length >= 2;
}

/** Long message with many line breaks → templated format. */
function looksStructured(msg: string): boolean {
  const newlines = (msg.match(/\n/g) ?? []).length;
  return newlines >= 3 && msg.length > 200;
}

/** Multiple WhatsApp-bold spans (*text*) — common in Business templates. */
function hasHeavyFormatting(msg: string): boolean {
  const bold = (msg.match(/\*[^*\n]{2,}\*/g) ?? []).length;
  const italic = (msg.match(/(^|\s)_[^_\n]{2,}_($|\s)/g) ?? []).length;
  return bold + italic >= 2;
}

/** Business intro + explicit CTA in the same message. */
function hasBusinessIntroAndCTA(msg: string): boolean {
  const intro =
    /(somos\s+(a|o)|aqui\s+(é|e)\s+(a|o|da|do)|bem[\s-]?vind[oa])/i.test(msg) ||
    /(we\s+are|this\s+is\s+the\s+team|welcome\s+to)/i.test(msg);
  const cta =
    /(clique|acesse|agende|confira|saiba\s+mais|fale\s+conosco|veja\s+mais)/i.test(
      msg,
    ) || /(click\s+here|book\s+now|schedule|learn\s+more|visit\s+our)/i.test(msg);
  return intro && cta;
}

export interface AutoReplyContext {
  /** Seconds between our last outbound and this inbound. */
  secondsSinceOutbound?: number;
}

export function isAutoReply(message: string, ctx?: AutoReplyContext): boolean {
  const msg = message.trim();

  if (!msg) return false;

  // Tier 1: single strong match. Runs first so short unambiguous auto-reply
  // phrases ("Deixe sua mensagem", "Como podemos ajudar?") are caught.
  if (STRONG_PATTERNS.some((p) => p.test(msg))) return true;

  // Tier 2 is noisier, so short messages bypass it entirely.
  if (msg.length < 20) return false;

  let score = 0;

  if (MENU_PHRASES.some((p) => p.test(msg))) score += 2;
  if (hasMenuStructure(msg)) score += 2;
  if (GENERIC_WELCOME.some((p) => p.test(msg))) score += 1;
  if (SOCIAL_CTA.some((p) => p.test(msg)) && msg.length > 150) score += 1;
  if (looksStructured(msg)) score += 1;
  if (hasHeavyFormatting(msg) && msg.length > 100) score += 1;
  if (hasBusinessIntroAndCTA(msg) && msg.length > 150) score += 1;

  // Speed signal only combines with content — never triggers on its own
  if (
    ctx?.secondsSinceOutbound !== undefined &&
    ctx.secondsSinceOutbound >= 0 &&
    ctx.secondsSinceOutbound < 5
  ) {
    score += 2;
  }

  return score >= 3;
}

/**
 * Reply within 3 seconds of our outbound → almost certainly automated.
 * Kept as a hard standalone signal; the softer 5s window is folded into
 * the scoring inside isAutoReply.
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
