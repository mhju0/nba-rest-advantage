-- Enable Row-Level Security on all public tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatigue_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key can SELECT)
CREATE POLICY "Allow public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.games FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.fatigue_scores FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON public.predictions FOR SELECT USING (true);

-- Service role full access (data pipeline + API routes use DATABASE_URL with service role)
CREATE POLICY "Allow service role all" ON public.teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role all" ON public.games FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role all" ON public.fatigue_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service role all" ON public.predictions FOR ALL USING (auth.role() = 'service_role');
