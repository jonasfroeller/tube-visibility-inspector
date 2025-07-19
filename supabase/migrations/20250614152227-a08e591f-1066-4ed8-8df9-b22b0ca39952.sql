
-- Create a table to cache video statuses
CREATE TABLE public.video_cache (
    video_id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add an index on the timestamp for efficient querying of old cache entries
CREATE INDEX idx_video_cache_cached_at ON public.video_cache (cached_at);

-- Enable Row Level Security for the table.
-- The edge function will use a service role key to bypass this, ensuring data is secure.
ALTER TABLE public.video_cache ENABLE ROW LEVEL SECURITY;

