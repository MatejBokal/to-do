# Shiplog

Personal tool for managing digital products: bugs, features, ideas, modifications and releases.
Built for one owner now, with room for a coworker later. It replaces ClickUp, which the owner found a poor fit.

## What the owner needs, and why this exists

- A real model for **products, versions and releases**. ClickUp has none.
- **Turning an idea into a feature is one step** and keeps its history. No copy and paste.
- **Fast capture**: one line, keyboard first.
- **Work and Personal kept separate**, each with its own products.
- Cheap and owned by the owner. Supabase and Vercel were the owner's choice. Do not swap the stack.
- Solo today. A coworker is a possibility "far in the future", so the data model supports membership but there is no invite UI.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (Postgres, email magic-link auth, Row Level Security)
through `@supabase/ssr` and `@supabase/supabase-js`. Plain CSS in `app/globals.css`. No Tailwind, no component library,
no ORM, no generated database types. Deploys to Vercel.

The owner works on **Windows**. Keep scripts and instructions cross-platform (nothing bash-only in `package.json`).

## Commands

`npm install` · `npm run dev` · `npm run build` · `npm start`

Environment (`.env.local`, copy from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(a legacy anon key should also work in that variable), optional `NEXT_PUBLIC_SITE_URL`.

Next 16 calls the request interceptor `proxy.ts` (exports `proxy`). On Next 15 or older it is `middleware.ts` (exports `middleware`).

## Status: read this first

This code was written in a sandbox where the npm registry was blocked. So:

- `npm install` and `next build` have **never been run**, and the app has **never run against a live Supabase project**.
- `@supabase/ssr` and `@supabase/supabase-js` are `"latest"` in `package.json`. After the first install, commit the lockfile and consider pinning.
- What **was** verified:
  - `supabase/migrations/0001_init.sql` on real PostgreSQL 16 with a stand-in for Supabase's `auth` schema. The 17 checks in
    `supabase/tests/` pass: numbering, history, releases, RLS between two users, anonymous access, the coworker flow.
  - `lib/parse-capture.ts` and `lib/changelog.ts`, tested directly (cases under Tests).
  - A strict TypeScript check, but only against hand-written stand-in types for next, react and supabase.
- **Not** verified: everything that depends on the real Next.js, React or Supabase runtime or types.

### First tasks, in order

1. `npm install`, then `npm run build`. Fix errors with the smallest change that keeps the intent.
2. Get a database: a Supabase project (paste the migration into the SQL editor) or `supabase start` if Docker is available.
3. `npm run dev` and walk through the manual checklist below. Fix what breaks.
4. Re-run `supabase/tests/` whenever the migration changes.
5. Commit the lockfile. Do not add features until the checklist passes.

### Likely friction (real types versus the stand-ins)

- The `@supabase/ssr` cookie adapter types (`setAll` parameter) in `lib/supabase/server.ts` and `lib/supabase/proxy.ts`.
- Next 16 details: async `params`, `searchParams`, `cookies()` and `headers()`; `proxy.ts`; `redirect()` inside server actions.
- `redirect()` and `notFound()` thrown from inside `React.cache` in `lib/data.ts`.
- `<form action={serverAction}>` typing, and `useTransition` with async callbacks (React 19).
- Supabase results are untyped (`any`). Pass every result through `rows<T>()` or a cast before calling `.map` or `.find`,
  otherwise strict mode reports implicit-any callback parameters.
- Auth: the magic link works in the browser that requested it. Cross-device needs the `token_hash` email template (see README).
  `proxy.ts` calls `getUser()` on every request; `getClaims()` is a possible optimisation.

## Data model

`supabase/migrations/0001_init.sql` is the source of truth.

Space (work | personal) → Product (key such as ACME) → Item (bug | feature | idea | modification | task).
Product → Release (version) ← `items.release_id`.

Invariants to preserve:

- Access is by space membership: `space_members` (owner | admin | member) and the security-definer helpers
  `is_space_member()` and `is_space_admin()`. Every space-scoped table has `space_id` and an RLS policy built on it. Never weaken RLS.
- `items.product_id` is nullable. Unsorted captures sit in the Inbox with no number. `items.number` is a per-product counter
  assigned by trigger (ACME-12) and reassigned if the product changes. Items cannot move between spaces. `space_id` is forced from the product by trigger.
- The composite foreign key `(product_id, release_id)` → `releases (product_id, id)` guarantees an item only joins a release of its
  own product. `ON DELETE SET NULL (release_id)` needs Postgres 15+. Changing an item's product clears its release (done in `updateItem`).
- `item_events` holds history and comments. History rows are written only by the `log_item_changes` trigger (security definer).
  Users can only insert `kind = 'comment'` rows as themselves. A promotion is a `type` change away from `idea`; the UI words it "Promoted from idea to …".
- `ensure_default_spaces()` creates Work and Personal for the **first user only** (when no spaces exist). Later users see
  "No spaces yet" until they are added to `space_members`. Slugs are unique per owner only, so if a "create space" feature is ever
  added, make slugs globally unique or route by id.
- Statuses: inbox, triaged, planned, in_progress, done, parked, rejected. `completed_at` follows `done`.

## Code map

- `app/` routes: `/login`, `/auth/confirm` (accepts `code` and `token_hash`), `/` (first space, or "No spaces yet"), `/s/[space]` (Inbox),
  `/s/[space]/all`, `/s/[space]/p/[key]` (product items), `/s/[space]/p/[key]/releases`, `/s/[space]/i/[id]` (item), `/s/[space]/new-product`.
- `lib/actions.ts`: every server action.
- `lib/data.ts`: `getContext(slug)` (cached per request: user, spaces, current space, products, members) and `rows<T>()`.
- `lib/parse-capture.ts`: the quick-capture grammar. `lib/changelog.ts`: Markdown release notes. `lib/types.ts`: enums, labels, interfaces, `itemKey()`.
- `lib/supabase/{server,proxy,env}.ts`: clients and session refresh.
- `components/`: `ItemsView` (shared list for Inbox, All and product pages), `CaptureBar`, `StatusSelect`, `NavLink`, `Sidebar`, `TypeMark`, `CopyButton`.
  Client components only where interaction needs them.

## Conventions and decisions to keep

- Forms are plain `<form action={serverAction}>`. Problems the person can fix (taken key, empty title) call `back()`, which redirects to the
  form's `return_to` with `?error=`, because errors thrown inside server actions are hidden in production builds. Unexpected failures throw.
  Mutations call `revalidatePath('/', 'layout')`.
- The item page form has `key={item.updated_at}` so it remounts with the saved values after a save or a promotion.
- Capture grammar: `bug: title #KEY !high ~m // notes`.
  Types `bug | feature | idea | mod | task` (aliases `fix`, `feat`, `change`, `todo`, `chore`); no prefix means idea.
  `#KEY` counts only if it matches a real product. Priority `!urgent | !high | !med | !low` (also `!u !h !m !l`). Effort `~xs` to `~xl`.
  ` // ` with spaces starts the description, and flags inside it are not parsed. The server re-parses; the client parse is only a preview.
- Ideas are not offered for releases until promoted. Adding an item to a release moves Inbox or Triaged items to Planned.
  "Mark released" sets the release's open items to Done.
- Design: the interface is ink on paper, and **colour only ever means item type** (shape and colour: bug circle, feature diamond, idea ring,
  modification square, task outlined square). The capture bar is the one loud element. Fonts are Hanken Grotesk and JetBrains Mono
  (Google Fonts link in `app/layout.tsx`, system fallbacks). Light and dark through `prefers-color-scheme` tokens. Sentence case, plain verbs,
  no all-caps labels, no decorative motion. Do not add Tailwind or a UI kit without asking.

## Tests

- Database: see the header of `supabase/tests/10_schema_and_rls.test.sql`. It needs an empty local database and must never be run against the real project.
- Parser and changelog cases worth turning into unit tests once a runner is chosen (none is set up):
  `bug: login fails #acme !high ~m // notes` parses to bug, ACME, high, m, with the notes as description;
  `Note: remember x` stays an idea with its title intact; `#nope` stays in the title; `https://x.com/a` is not split;
  flags inside the `//` part are ignored; the changelog heading reads `## 1.2.0 – Name (1 Nov 2026)` with New, Changed, Fixed sections.

### Manual checklist for the first run

1. Sign in by email link. The Work and Personal spaces appear.
2. New product: name "Acme app", key ACME.
3. Press `c`, type `bug: login fails #acme !high`, press Enter. The chips preview the filing, and it appears as ACME-1.
4. Capture a plain thought. It lands in the Inbox with no product and no number. Triage it with the status select.
5. Open an item, edit its fields, save, add a note. Activity shows the changes.
6. On an idea, choose "Promote to feature". Activity says it was promoted.
7. Product → Releases: add 1.0.0, add an item to it, copy the changelog, mark it released. Open items become Done.
8. Switch to Personal: it is empty and separate. Sign out and back in.

## Not built yet

Board view, edit or archive a product, delete a release, more spaces, import from ClickUp, a public feedback form,
an invite UI for a coworker (the README has the SQL).

## Housekeeping

Do not commit `.env.local`. Do not run destructive Supabase commands (such as `db reset`) against a remote project.
Commit messages: a short imperative summary.
