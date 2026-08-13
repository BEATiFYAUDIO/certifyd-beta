# Certifyd Beta

Standalone founder-operated MVP for managing Certifyd technical-beta participants. This is separate from `certifyd.me`, ContentBox, Fan PWA, and Certifyd Core.

## Architecture

```text
LOCAL ADMIN APP
    ↓
Private local beta data
    ↓
Generate sanitized static invite pages
    ↓
Git commit/push
    ↓
GitHub Pages
    ↓
https://beta.certifyd.me
```

The admin app remains local only. The public site is static only and contains only allowlisted invite content.

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
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PUBLIC_SITE_ORIGIN="https://beta.certifyd.me"
BETA_CONTACT_EMAIL="beta-contact@example.com"
NODE_ENV="development"
```

`BETA_CONTACT_EMAIL` is used for the static public Accept/Decline `mailto:` links. If omitted, the app falls back to `ADMIN_EMAIL` locally.

`NEXT_PUBLIC_APP_URL` is the private local admin/preview origin. `PUBLIC_SITE_ORIGIN` is the published GitHub Pages origin used for copied public invite URLs. Production startup rejects known development/default passwords and requires both URL origins to use HTTPS.

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

Open `http://localhost:3000` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Admin Workflow

1. Start admin with `npm run dev`.
2. Create or open a participant.
3. Assign a mission.
4. Customize invitation copy through the mission.
5. Preview the public page from the participant detail page.
6. Publish the invite to regenerate `generated-public/`.
7. Copy the public URL.
8. Send the invite.
9. Manually mark the participant `ACCEPTED` or `DECLINED` after receiving email.
10. Track milestones and founder notes locally.
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

- `Accept Invitation`
- `Decline`

Both open pre-addressed `mailto:` messages to `BETA_CONTACT_EMAIL`. They do not update the local database. The founder manually marks the participant accepted or declined in local admin.

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

## GitHub Pages

Repository: `BEATiFYAUDIO/certifyd-beta`

Custom domain: `beta.certifyd.me`

The Pages workflow is `.github/workflows/pages.yml` and deploys only `generated-public/`.
