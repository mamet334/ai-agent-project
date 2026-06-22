CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.mamet_memory (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  semantic_identity text NOT NULL,
  confidence float DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone,
  truth_score float DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS mamet_memory_user_key_idx ON public.mamet_memory(user_id, key);
CREATE INDEX IF NOT EXISTS mamet_memory_truth_score_idx ON public.mamet_memory(truth_score DESC);
