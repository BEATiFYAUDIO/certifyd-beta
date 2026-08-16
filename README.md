# Certifyd Beta

Standalone founder-operated MVP for managing Certifyd technical-beta participants. This is separate from `certifyd.me`, ContentBox, Fan PWA, and Certifyd Core.

## Architecture

```text
LOCAL OR VERCEL ADMIN APP
    ↓
Private beta PostgreSQL data
    ↓
Generate sanitized static invite pages
    ↓
Git commit/push
    ↓
GitHub Pages
    ↓
https://beta.certifyd.me

PUBLIC INVITE ACCEPT
    ↓
Vercel dynamic API
    ↓
Same PostgreSQL database
    ↓
Participant becomes ACTIVE
```

The public invite site remains static and contains only allowlisted invite content. The dynamic admin/API may run locally or on Vercel. If public invite Accept buttons should update dashboard status, the static page must post to a reachable dynamic app origin through `BETA_ACCEPT_ORIGIN`, and that app must use the same PostgreSQL database as the dashboard.

## Stack

- Next.js App Router + TypeScript for the local admin
- Prisma ORM
- PostgreSQL for local private persistence
- Single-admin env-based auth with encrypted `iron-session` cookies
- Generated static public pages in `generated-public/`
- GitHub Pages workflow deploying only `generated-public/`

## Environment

Create `.env.local` from `.env.example`:

```bash
DATABASE_URL="postgresql://certifyd_beta:replace-me@localhost:5432/certifyd_beta"
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD="long-unique-password-or-bcrypt-hash"
SESSION_PASSWORD="at-least-32-random-characters"
NEXT_PUBLIC_APP_URL="http://localhost:3001"
PUBLIC_SITE_ORIGIN="https://beta.certifyd.me"
BETA_ACCEPT_ORIGIN="http://localhost:3001"
CERTIFYD_CORE_REPOSITORY_URL="https://github.com/BEATiFYAUDIO/contentbox"
BETA_CONTACT_EMAIL="beta-contact@example.com"
NODE_ENV="development"
```

`BETA_CONTACT_EMAIL` is used for public contact/decline links. If omitted, the app falls back to `ADMIN_EMAIL` locally.

`NEXT_PUBLIC_APP_URL` is the dynamic admin/preview app origin. `PUBLIC_SITE_ORIGIN` is the published GitHub Pages origin used for copied public invite URLs. `BETA_ACCEPT_ORIGIN` is the reachable dynamic app origin that static invite pages post to when a tester accepts. In production, set `BETA_ACCEPT_ORIGIN` to the Vercel app URL, not `beta.certifyd.me`, unless `beta.certifyd.me` itself is routed to the dynamic app. `CERTIFYD_CORE_REPOSITORY_URL` is the public repository URL inserted into Mission 01 AI handoff prompts. Production startup rejects known development/default passwords and requires URL origins used at runtime to use HTTPS.

## Database

PostgreSQL is required. The private DB stays local and is never copied into public output.

```bash
npm install
npm run db:migrate
npm run db:seed
```

Use `npm run db:deploy` for migration-only environments.

## Backup and Restore

Create a timestamped local backup:

```bash
npm run backup
```

Backups are written to `backups/`, which is gitignored.

Restore example:

```bash
psql "$DATABASE_URL" --file backups/<backup-file>.sql
```

Restore into a disposable database first when validating a backup.

## Running Locally

```bash
cd /home/Darryl/Projects/certifyd-beta
npm install
cp .env.example .env.local
# edit .env.local with your Postgres URL, admin credentials, and BETA_CONTACT_EMAIL
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3001` when running with `npm run dev -- -p 3001`, or `http://localhost:3000` with the default Next dev port, and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Admin Workflow

1. Start admin with `npm run dev`.
2. Create or open a participant.
3. Assign a mission.
4. Customize invitation copy through the mission.
5. Preview the public page from the participant detail page.
6. Publish the invite to regenerate `generated-public/`.
7. Copy the public URL.
8. Send the invite.
9. When the tester clicks Accept, the configured dynamic API marks the invite `ACCEPTED`, the participant `ACTIVE`, and the current mission `ACTIVE`.
10. Track milestones and founder notes locally or in the deployed admin using the same database.
11. Create downstream participants when needed.
12. Unpublish an invite to remove only its static public page.

## Static Public Publishing

Generate the static public site:

```bash
npm run publish:static
```

Scan generated output for private data:

```bash
npm run scan:public
```

If public content did not change, publishing prints:

```text
No public changes detected. Publish skipped.
```

The generated public output includes:

```text
generated-public/index.html
generated-public/invite/<secure-code>/index.html
generated-public/CNAME
```

The GitHub Pages workflow deploys only `generated-public/`.

## Accept / Decline

Static invite pages include:

- `Accept & Start Mission`
- `Decline`

`Accept & Start Mission` posts to `${BETA_ACCEPT_ORIGIN}/api/invites/<code>/accept`. That route updates the private database and moves the participant into active beta status. `Decline` remains a pre-addressed contact link.

If `BETA_ACCEPT_ORIGIN` is missing or points to localhost, publishing public invites is blocked because GitHub Pages cannot update dashboard status by itself.

## Privacy Model

Public invite output uses an explicit DTO only:

- display name
- public invite copy
- mission title
- mission public description
- invite code
- contact email for public response CTA
- Certifyd branding

Public output must never contain participant email, founder notes, internal statuses, private milestones, milestone notes, database IDs, relationship metadata, admin credentials, session information, env files, backups, or database contents.

## Teddy → Producer → Artist Dry Run

The dev seed creates demo records:

```text
Teddy Demo
→ Producer Demo
→ Artist Demo
```

Expected relationship:

- Teddy Demo is a root participant.
- Producer Demo has Teddy Demo as parent and network origin.
- Artist Demo has Producer Demo as parent and Teddy Demo as network origin.

Verify in `/admin` Invite tree or participant detail pages. Do not publish demo pages to the final public site.

## Security Model

- Admin pages are protected by server-side `requireAdmin()` in the admin layout.
- Admin mutations call `requireAdmin()` inside every server action.
- Credentials only come from environment variables.
- Session cookies are `HttpOnly`, `SameSite=Lax`, path-scoped, and `secure` in production.
- Session data stores only admin email and login timestamp, never the password.
- Plaintext local admin passwords use timing-safe comparison; bcrypt hashes are supported.
- Login uses in-memory rate limits.
- Invite codes use cryptographically secure randomness with URL-safe 192-bit tokens and unique DB constraints.
- Regenerating an invite revokes and unpublishes prior active/opened invites.
- Revoking an invite unpublishes it.
- Founder notes, emails, internal IDs, audit events, session data, and relationship metadata are never exposed on public invite pages.

## Tests

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm audit
npm audit --omit=dev
```

Tests require a reachable PostgreSQL database. Set `TEST_DATABASE_URL` to a disposable database if different from `DATABASE_URL`. Tests create and drop an isolated schema.


## Minimal Vercel Dynamic API Deployment

Use Vercel for the private dynamic admin/API and keep GitHub Pages for `https://beta.certifyd.me` static invite pages.

1. In Vercel, import GitHub repository `BEATiFYAUDIO/certifyd-beta`.
2. Framework preset: Next.js.
3. Build command: `npm run build`.
4. Install command: `npm install`.
5. Add a production PostgreSQL database and set `DATABASE_URL` to that connection string.
6. Add these Vercel environment variables:

```env
DATABASE_URL=postgresql://...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
SESSION_PASSWORD=...
NEXT_PUBLIC_APP_URL=https://your-certifyd-beta-app.vercel.app
PUBLIC_SITE_ORIGIN=https://beta.certifyd.me
BETA_ACCEPT_ORIGIN=https://your-certifyd-beta-app.vercel.app
BETA_CONTACT_EMAIL=certifydcreator@gmail.com
CERTIFYD_CORE_REPOSITORY_URL=https://github.com/BEATiFYAUDIO/contentbox
CODEX_URL=https://openai.com/codex/
CLAUDE_CODE_URL=https://claude.com/product/claude-code
NODE_ENV=production
```

7. After the first deployment, run database migrations against the production database:

```bash
DATABASE_URL="postgresql://..." npm run db:deploy
DATABASE_URL="postgresql://..." npm run db:seed
```

8. Use the Vercel app URL for private admin/API access. Keep `beta.certifyd.me` pointed at GitHub Pages for public static invite pages.

Important: the local dashboard and Vercel dashboard only reflect the same invite status if they use the same `DATABASE_URL`. Publishing static GitHub Pages output still uses local git commands in this MVP; use the local admin for publishing unless a later phase adds GitHub API publishing from Vercel.

## GitHub Pages

Repository: `BEATiFYAUDIO/certifyd-beta`

Custom domain: `beta.certifyd.me`

The Pages workflow is `.github/workflows/pages.yml` and deploys only `generated-public/`.
