-- Tabela de configuração de teto diário por instância Evolution API
-- Editada via UI /bot. Substitui constante MAX_PER_INSTANCE_PER_DAY
-- que estava hardcoded em prospect-bot/lib/whatsapp.js.
CREATE TABLE IF NOT EXISTS public.evolution_instance_config (
  instance_name text PRIMARY KEY,
  daily_cap integer NOT NULL CHECK (daily_cap >= 0 AND daily_cap <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.evolution_instance_config IS
  'Daily WhatsApp send cap per Evolution API instance. Edited via /bot UI.';

INSERT INTO public.evolution_instance_config (instance_name, daily_cap) VALUES
  ('fastdevbuilds',  30),
  ('prospect-bot-2', 30),
  ('prospect-bot-3', 30)
ON CONFLICT (instance_name) DO NOTHING;
