# Development

## Requirements

- Node.js 22+
- npm
- Supabase project (cloud or local CLI)

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Add the Supabase URL and anon key to `.env.local`.

## Database

With the Supabase CLI installed:

```bash
supabase start
supabase db reset
```

For a hosted project, link it first and push migrations according to the Supabase CLI workflow.

## GitHub Pages

Create repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then enable **GitHub Actions** as the Pages source. A push to `main` runs tests/build and deploys `dist/`.

## Quality gates

```bash
npm run lint
npm run test
npm run build
npm run format:check
```
