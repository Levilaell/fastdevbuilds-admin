-- Lab de experimentos — tabelas pra rodar batches A/B de
-- nichos/copy/cidades formalmente, com métricas comparáveis.
--
-- Substitui o lib/bot-config.ts estático: variants definem o config
-- de cada batch (niches, cities, copy, volume alvo). Bot lê o
-- experimento ativo e distribui scrape entre variants.
--
-- leads.experiment_id e leads.experiment_variant_id estampam cada lead
-- com o variant que o originou — base de toda métrica do dashboard.

BEGIN;

-- ─── experiments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hypothesis text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'completed', 'aborted')),
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiments_running
  ON experiments(started_at DESC)
  WHERE status = 'running';

-- ─── experiment_variants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL
    REFERENCES experiments(id) ON DELETE CASCADE,
  name text NOT NULL,
  niches text[] NOT NULL DEFAULT '{}',
  cities text[] NOT NULL DEFAULT '{}',
  message_template text NOT NULL,
  target_volume integer NOT NULL DEFAULT 30,
  qualification_filters jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiment_variants_experiment
  ON experiment_variants(experiment_id);

-- ─── leads: FKs para variant tracking ────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS experiment_id uuid
    REFERENCES experiments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experiment_variant_id uuid
    REFERENCES experiment_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_experiment
  ON leads(experiment_id, outreach_sent_at DESC)
  WHERE experiment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_experiment_variant
  ON leads(experiment_variant_id)
  WHERE experiment_variant_id IS NOT NULL;

COMMIT;
