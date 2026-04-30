import { isValidPhone } from "@/lib/whatsapp";

export interface ResolvePhoneInput {
  place_id: string;
  phone: string | null;
  whatsapp_jid: string | null;
  evolution_instance: string | null;
}

export interface ResolvePhoneResult {
  phone: string;
  /** True when the resolved phone differs from lead.phone and should be persisted */
  shouldBackfill: boolean;
}

/**
 * Resolve a WhatsApp phone number for a lead using safe fallbacks:
 *   1. lead.phone
 *   2. unknown_<phone> place_id extraction
 *   3. whatsapp_jid @s.whatsapp.net
 */
export async function resolvePhoneForLead(
  input: ResolvePhoneInput,
): Promise<ResolvePhoneResult | null> {
  let phone = input.phone?.trim() || null;

  if (!phone && input.place_id.startsWith("unknown_")) {
    const candidate = input.place_id.replace("unknown_", "");
    if (isValidPhone(candidate)) {
      phone = candidate;
    }
  }

  if (!phone && input.whatsapp_jid) {
    const jid = input.whatsapp_jid;
    if (jid.endsWith("@s.whatsapp.net")) {
      const candidate = jid.split("@")[0].replace(/\D/g, "");
      if (isValidPhone(candidate)) {
        phone = candidate;
      }
    }
  }

  if (!phone) return null;

  return {
    phone,
    shouldBackfill: !input.phone,
  };
}
