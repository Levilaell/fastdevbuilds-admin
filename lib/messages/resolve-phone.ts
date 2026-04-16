import {
  isValidPhone,
  resolvePhoneFromLid,
  getInstances,
} from "@/lib/whatsapp";

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
 *   4. LID resolution via Evolution API
 *
 * Does NOT use "other lead on same instance" fallback.
 */
export async function resolvePhoneForLead(
  input: ResolvePhoneInput,
): Promise<ResolvePhoneResult | null> {
  let phone = input.phone?.trim() || null;

  if (!phone && input.place_id.startsWith("unknown_")) {
    const candidate = input.place_id.replace("unknown_", "");
    if (/^55\d{10,11}$/.test(candidate)) {
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
    } else if (jid.endsWith("@lid")) {
      const lidValue = jid.split("@")[0];
      const instName = input.evolution_instance ?? undefined;
      const inst = instName
        ? getInstances().find((i) => i.name === instName)
        : undefined;

      const resolved = await resolvePhoneFromLid(
        lidValue,
        inst?.name,
        inst?.apiKey,
      );

      if (resolved && isValidPhone(resolved)) {
        phone = resolved;
      }
    }
  }

  if (!phone) return null;

  return {
    phone,
    shouldBackfill: !input.phone,
  };
}
