-- Drop and recreate student_totals view to include hackerrank in total_solved
DROP VIEW IF EXISTS public.student_totals;
CREATE OR REPLACE VIEW public.student_totals
WITH (security_invoker = true) AS
SELECT
  p.id as user_id,
  coalesce(sum(ps.metric) filter (
    where ps.status = 'completed'
      and ps.platform in ('leetcode', 'codeforces', 'atcoder', 'hackerrank')
  ), 0)::int as total_solved,
  max(ps.last_updated) filter (where ps.status = 'completed') as last_scraped_at
FROM public.profiles p
LEFT JOIN public.platform_stats ps ON ps.user_id = p.id
WHERE p.role = 'student'
GROUP BY p.id;

REVOKE ALL ON public.student_totals FROM anon, authenticated;
