import type { Lead } from "@/lib/types";

type FollowUpLead = Pick<
  Lead,
  | "business_name"
  | "score_reasons"
  | "visual_score"
  | "country"
  | "outreach_channel"
>;

// Pain hooks ordered by impact — pick the first match
const PAIN_PRIORITY = [
  "poor_visual_quality",
  "outdated_design",
  "slow_mobile_severe",
  "slow_mobile_moderate",
  "slow_mobile_mild",
  "no_ssl",
  "no_booking",
  "no_form",
  "no_whatsapp",
  "no_mobile_viewport",
  "outdated_builder",
] as const;

// Short conversational observations — consequence baked in, no jargon
const PAIN_HOOKS_PT: Record<string, string> = {
  poor_visual_quality:
    "a qualidade visual do site não reflete o serviço de vocês — quem entra pela primeira vez não percebe o nível real",
  outdated_design:
    "o visual do site tá datado — a primeira impressão é o que faz o pessoal ficar ou sair",
  slow_mobile_severe:
    "o site demora bastante pra abrir no celular — quem pesquisa pelo Google acaba saindo antes de ver os serviços",
  slow_mobile_moderate:
    "o site demora pra carregar no celular — boa parte do pessoal desiste antes de ver tudo",
  slow_mobile_mild:
    "o site poderia carregar mais rápido no celular — faz diferença pra quem pesquisa pelo Google",
  no_ssl:
    "o navegador mostra aviso de 'site inseguro' quando alguém acessa — isso afasta cliente na hora",
  no_booking:
    "não dá pra agendar direto pelo site — quem quer marcar fora do horário fica sem opção",
  no_form:
    "não tem formulário no site — quem entra fora do horário não tem como pedir orçamento",
  no_whatsapp:
    "não tem botão de WhatsApp no site — quem quer falar com vocês precisa ficar procurando o número",
  no_mobile_viewport:
    "o site não abre direito no celular — e hoje a maioria pesquisa assim",
  outdated_builder:
    "o site tá numa plataforma que limita bastante — dá pra ficar muito melhor",
};

const PAIN_HOOKS_EN: Record<string, string> = {
  poor_visual_quality:
    "your site's design doesn't do justice to the quality of your work — visitors can't tell from the first impression",
  outdated_design:
    "the site design looks a bit dated — first impressions are everything when someone lands on your page",
  slow_mobile_severe:
    "your site takes a while to load on mobile — most people searching on Google won't wait around",
  slow_mobile_moderate:
    "your site is a bit slow on mobile — a good chunk of visitors leave before seeing your services",
  slow_mobile_mild:
    "your site could load faster on mobile — it makes a real difference for search traffic",
  no_ssl:
    "browsers are showing a 'not secure' warning on your site — that turns people away before they even look around",
  no_booking:
    "there's no way to book directly from the site — anyone outside business hours can't schedule",
  no_form:
    "there's no contact form — visitors outside business hours have no way to reach out",
  no_whatsapp:
    "there's no quick contact button on the site — visitors have to search for a way to reach you",
  no_mobile_viewport:
    "the site doesn't display well on phones — and that's where most of your traffic comes from",
  outdated_builder:
    "the site's on a platform that really limits what it can do — there's a lot of room to level up",
};

function isEN(lead: FollowUpLead): boolean {
  return lead.country === "US" || lead.outreach_channel === "email";
}

function getTopPainHook(lead: FollowUpLead): string | null {
  const en = isEN(lead);
  const hooks = en ? PAIN_HOOKS_EN : PAIN_HOOKS_PT;
  const reasons =
    lead.score_reasons
      ?.split(",")
      .map((r) => r.trim())
      .filter(Boolean) ?? [];

  // Check by impact priority
  for (const key of PAIN_PRIORITY) {
    if (reasons.includes(key) && hooks[key]) {
      return hooks[key];
    }
  }

  // Fallback: low visual_score even if not in score_reasons
  if (lead.visual_score != null && lead.visual_score <= 4) {
    return en
      ? "your site's design doesn't do justice to your work — first impressions count"
      : "o visual do site não faz jus ao trabalho de vocês — a primeira impressão conta muito";
  }

  // Last resort: any reason with a hook
  for (const reason of reasons) {
    if (hooks[reason]) return hooks[reason];
  }

  return null;
}

/**
 * Generate a personalized follow-up message based on lead data.
 *
 * followUpCount 0 → remind + reinforce pain + soft CTA
 * followUpCount 1 → reduce pressure + keep door open
 */
export function generateFollowUpMessage(
  lead: FollowUpLead,
  followUpCount: number,
): string {
  const name = lead.business_name?.trim() || null;
  const en = isEN(lead);

  if (followUpCount === 0) {
    return followUp1(name, getTopPainHook(lead), en);
  }
  return followUp2(name, en);
}

// ── Follow-up 1: observation + consequence + soft CTA ───────────────────

function followUp1(
  name: string | null,
  painHook: string | null,
  en: boolean,
): string {
  if (en) {
    if (painHook) {
      return name
        ? `${name} — ${painHook}. I can put together a quick mockup showing the fix, no strings attached.`
        : `Hi — ${painHook}. I can put together a quick mockup showing the fix, no strings attached.`;
    }
    return name
      ? `${name} — I'd love to put together a quick concept for your site, no commitment. Want me to give it a shot?`
      : `Hi — I'd love to put together a quick concept for your site, no commitment. Want me to give it a shot?`;
  }

  // Portuguese (BR)
  if (painHook) {
    return name
      ? `${name}, ${painHook} — posso te mostrar como ficaria resolvendo isso?`
      : `Oi, ${painHook} — posso te mostrar como ficaria resolvendo isso?`;
  }
  return name
    ? `${name}, posso montar um exemplo de como ficaria um site novo pra vocês — sem compromisso. Faz sentido?`
    : `Oi, posso montar um exemplo de como ficaria um site novo pra vocês — sem compromisso. Faz sentido?`;
}

// ── Follow-up 2: acknowledge timing + keep door open ────────────────────

function followUp2(name: string | null, en: boolean): string {
  if (en) {
    return name
      ? `${name}, no worries if the timing isn't right — whenever you want to see what a new site could look like, just let me know.`
      : `No worries if the timing isn't right — whenever you want to see what a new site could look like, just let me know.`;
  }

  return name
    ? `${name}, se agora não é o momento, tranquilo — quando quiser ver como ficaria, é só me chamar.`
    : `Se agora não é o momento, tranquilo — quando quiser ver como ficaria, é só me chamar.`;
}
