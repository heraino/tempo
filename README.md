# Tempo — AI Running Coach

A personalized AI running coach that adapts your training plan as your week unfolds.

## Project structure

```
src/
  app/              ← Next.js pages (App Router). Each folder = a URL route.
    layout.tsx      ← Outer HTML shell applied to every page.
    page.tsx        ← The landing page at /.
    globals.css     ← Global styles (imports Tailwind CSS).
  components/       ← Reusable UI components (buttons, cards, etc.) — Milestone 2+
  lib/
    auth/           ← Auth.js session handling — Milestone 2
    db/             ← Postgres database client and schema — Milestone 2
    coaching/       ← Nebius LLM coaching engine — Milestone 3
    payments/       ← Stripe subscription logic — Milestone 4
public/             ← Static assets (images, icons)
```

## Running locally

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Install dependencies (only needed once, or after adding new packages)
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The page hot-reloads automatically as you edit files — no need to restart.

## Deploying to Vercel

Vercel is the company that makes Next.js, so deployment is one command (after a one-time setup).

### One-time setup

1. Create a free account at [vercel.com](https://vercel.com).
2. Install the Vercel CLI: `npm install -g vercel`
3. Log in: `vercel login` — this opens a browser to authenticate.

### Deploy

```bash
# From the project root:
vercel
```

The first time you run this, Vercel will ask a few questions:
- **Set up and deploy?** → Yes
- **Which scope?** → Your personal account
- **Link to existing project?** → No (it's new)
- **Project name?** → `tempo` (or whatever you like)
- **Directory?** → `.` (current directory — just press Enter)

Vercel then builds and deploys. It prints a live URL like `https://tempo-xxxx.vercel.app`.

### Subsequent deploys

```bash
vercel --prod
```

This pushes a production deployment. Vercel also auto-deploys on every `git push` if you connect your GitHub repo in the Vercel dashboard under **Project Settings → Git**.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Auth | Auth.js *(Milestone 2)* |
| Database | Postgres *(Milestone 2)* |
| AI / LLM | Nebius *(Milestone 3)* |
| Payments | Stripe *(Milestone 4)* |
