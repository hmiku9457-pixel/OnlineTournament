# Security

Do not report exploitable code/access issues in public GitHub issues. Use the repository security advisory flow when enabled.

## Sensitive areas

- Supabase RLS policies
- `SECURITY DEFINER` functions
- match/player short-code verification
- anonymous scoring RPCs
- tournament ownership and staff roles

Never place the Supabase service-role key in the browser, GitHub Pages, repository, or `VITE_*` variables. Only the public anon key belongs in the frontend.
