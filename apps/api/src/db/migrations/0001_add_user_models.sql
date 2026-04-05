CREATE TABLE IF NOT EXISTS user_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  label text,
  added_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_models_user_model_idx ON user_models(user_id, model_id);
