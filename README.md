# Team Tracker

A small, Purdue black & gold task board for a class project team.

- **Board**: To Do → In Progress → Needs Confirmation → Confirmed. Anyone can create and assign tasks.
  When the owner marks a task done, **any other teammate** confirms it (there's no team lead; you can't confirm your own task).
- **Schedule**: deliverables, presentations and meetings with date, time and location. Link tasks to a milestone to see its progress.
- **Team**: each person's assigned / in progress / confirmed counts, plus the checks they've given.
- **Recap**: contributions table, milestone summary, a full activity timeline, and a lessons-learned board
  (went well / improve / try next time). Print or save as PDF for the end-of-project presentation.
- **Admin** (you): create a team per project, share its join code, archive it when the project ends (read-only),
  export everything as JSON, or delete it and start fresh.

Vite + React + TypeScript, Supabase (Postgres, Realtime, anonymous auth), hosted on GitHub Pages.
Every database object is prefixed `tpt_`, so it shares a Supabase project with other apps safely.

## How people get in

No accounts or passwords. Each device signs in anonymously behind the scenes, then:

1. Teammate opens the site and enters the team's **join code**.
2. Picks their name from the roster (the device remembers).

Admin: click **Admin** in the footer (or open `#admin`) and enter the admin passcode once per device.

## Setup

### 1. Supabase (reuses the game-night project)

1. Dashboard → **SQL Editor** → paste and run `supabase/migrations/20261018000000_team_tracker.sql`.
2. Still in the SQL editor, set the admin passcode:
   ```sql
   select private.tpt_set_admin_passcode('your-passcode-here');
   ```
3. **Authentication → Sign In / Providers → Anonymous sign-ins** must be ON (it already is for game night).

### 2. Run locally

```bash
cp .env.example .env   # fill in URL + anon key (Project Settings -> API)
npm install
npm run dev            # http://localhost:5174
```

Testing as several teammates in one browser: add `?as=2`, `?as=3`… to the URL. Each gets its own identity.

### 3. Deploy to GitHub Pages

1. The production Supabase URL + anon key are committed in `.env.production` (public by design; RLS protects the data).
   Switching Supabase projects = edit that file.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Push to `main`. Live at https://corrigk.github.io/team-progress-tracker/

## Starting over with a new group

Admin → **Export** (keeps a JSON copy) → **Archive** or **Delete** → **+ New team**.
To remove the tracker from Supabase entirely, run `supabase/teardown.sql`.
