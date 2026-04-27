-- Track each time a lead opens the Vercel preview we sent. Populated by the
-- public ingest endpoint /api/preview-view, which receives a sendBeacon call
-- from public/track.js embedded in the preview HTML. Only fires when the
-- preview URL carries ?v={place_id} — links opened by the admin without that
-- param do not log, so Levi clicking through to QA his own preview doesn't
-- pollute the data.
CREATE TABLE IF NOT EXISTS public.preview_views (
  id          BIGSERIAL PRIMARY KEY,
  place_id    TEXT NOT NULL REFERENCES public.leads(place_id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  ip          TEXT,
  referrer    TEXT
);

CREATE INDEX IF NOT EXISTS preview_views_place_viewed_idx
  ON public.preview_views (place_id, viewed_at DESC);

COMMENT ON TABLE public.preview_views IS
  'One row per beacon hit from the embedded tracker on a sent preview. Used as the conversion signal — first_view + count drive follow-up priority in the inbox/kanban.';
