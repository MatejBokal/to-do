# Shiplog

A small tool for running your own digital products: bugs, features, ideas, modifications and releases, in one place.
Next.js on Vercel, Supabase for the database and sign-in.

**What it does**

- **Work and Personal are separate spaces.** Each has its own products and items. Switching is one click.
- **Products have versions and releases.** Put items into a release, mark it released, copy the changelog as Markdown.
- **Ideas become features in place.** "Promote to feature" changes the type and keeps the history and notes. Nothing is copied.
- **Capture is one line.** Press `c` anywhere, type, press Enter. Items without a product wait in the Inbox for triage.

## Setup

### 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run it.
3. Go to **Authentication → URL Configuration**. Set **Site URL** to `http://localhost:3000` for now and add these to **Redirect URLs**:
   `http://localhost:3000/**` and, later, `https://YOUR-APP.vercel.app/**`.
4. Go to **Project Settings → API Keys** and copy the project URL and the publishable key.

### 2. Run it locally

```bash
cp .env.example .env.local     # fill in the URL and publishable key
npm install
npm run dev
```

Open http://localhost:3000 and sign in with your email. The first account gets the **Work** and **Personal** spaces.
Then choose **New product** in the sidebar, give it a key like `ACME`, and press `c`.

### 3. Lock sign-ups

After your first sign-in, turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Without
this, anyone who finds the URL could create an account (they would see no data, but there is no reason to allow it).

### 4. Deploy to Vercel

Push the folder to a Git repository, import it in Vercel, and add the same two environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Then add the Vercel URL to Supabase
**Redirect URLs** and set it as the **Site URL**.

> Sign-in links work in the browser where you asked for them. To open the link on another device, change the
> Magic Link email template in Supabase to
> `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a>`.

## Capture syntax

```
bug: login fails on Safari #ACME !high ~m // happens after password reset
```

| Part | Meaning |
| --- | --- |
| `bug:` `feature:` `idea:` `mod:` `task:` | Type. Without one, the item is an idea. Also accepted: `feat:`, `fix:`, `change:`, `todo:` |
| `#ACME` | Product key. Only used if it matches a product. On a product page, that product is the default |
| `!urgent` `!high` `!med` `!low` | Priority (`!u` `!h` `!m` `!l` also work) |
| `~xs` `~s` `~m` `~l` `~xl` | Effort |
| `// text` | Notes, saved as the description |

The chips under the capture bar show how the line will be filed before you press Enter.

## How the pieces fit

```
Space (Work / Personal)
 └─ Product (key: ACME)
     ├─ Release (1.0.0, 1.1.0 ...)
     └─ Item (ACME-12: bug, feature, idea, modification or task)
```

- Items numbered `ACME-12` belong to a product. Unsorted items have no number until you give them a product.
- Statuses: Inbox, Triaged, Planned, In progress, Done, Parked, Rejected.
- Adding an item to a release moves it from Inbox or Triaged to Planned. Marking the release released moves every open item in it to Done.
- Ideas are not offered for releases until you promote them.
- Every change is logged on the item page, next to your notes.

## Adding a coworker later

Access is by space membership, and the data model already supports it. A coworker signs in once (invite them from
Authentication → Users, or turn sign-ups on briefly). They will see "No spaces yet" until you add them. In the SQL editor:

```sql
insert into public.space_members (space_id, user_id, role)
select s.id, u.id, 'member'
from public.spaces s, auth.users u
where s.slug = 'work' and u.email = 'coworker@example.com';
```

They then see only the Work space. Items can be assigned to them from the item page.

## Next.js version note

This targets Next.js 16, where the request interceptor file is called `proxy.ts`. On Next.js 15 or older, rename it
to `middleware.ts` and rename the exported function `proxy` to `middleware`.

## What has and has not been tested

- **Database:** the migration was run on a real PostgreSQL 16 server with the Supabase `auth` schema imitated, and 17
  checks passed: numbering, history, releases, row-level security between two users, anonymous access, the coworker flow.
- **Quick-capture parser and changelog:** tested directly.
- **App code:** type-checked in strict mode, but against stand-in types for Next.js, React and Supabase, because the
  npm registry was not reachable where this was written.
- **Not done:** `npm install`, `next build`, and running the app against a live Supabase project. Expect to fix a few
  small things the first time you run it, and use `npm run build` before deploying.

## Not built yet

Board view, editing or archiving a product, deleting a release, import from ClickUp, a public feedback form.
