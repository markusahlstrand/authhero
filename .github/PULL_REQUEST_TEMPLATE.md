<!--
Thanks for contributing! Everything below is a prompt, not a form to satisfy —
delete any section that doesn't apply to your change.

First PR? You'll be asked to sign the CLA once (see CONTRIBUTING.md); the bot
comments on this PR with the exact wording.
-->

## Summary

<!-- What changes, and why. If it fixes a bug, say what was actually wrong. -->

Closes #

## Affected packages

<!-- Tick what this touches. -->

- [ ] `authhero` (core Hono app, auth + management routes, login UI)
- [ ] `@authhero/adapter-interfaces` (the adapter contract — see note below)
- [ ] `@authhero/drizzle`
- [ ] `@authhero/kysely-adapter`
- [ ] `@authhero/aws-adapter`
- [ ] `@authhero/cloudflare-adapter`
- [ ] `@authhero/saml`
- [ ] `@authhero/proxy`
- [ ] `@authhero/multi-tenancy`
- [ ] `@authhero/widget`
- [ ] `create-authhero`
- [ ] `apps/admin`
- [ ] `apps/docs` / `apps/website`
- [ ] Repo tooling / CI only

## Changeset

- [ ] Added a changeset (`pnpm changeset`), or
- [ ] Not needed — this touches only `apps/`, docs, or repo tooling

<!--
Every PR that modifies a versioned package under packages/ needs one. Note the
package names above are what the changeset expects: the Drizzle adapter is
`@authhero/drizzle` (no `-adapter`), unlike kysely/aws/cloudflare.
-->

## How was this tested?

<!--
Which suites did you run, and what did you add? New behaviour should come with
a test. Useful commands:

  pnpm -r --filter './packages/**' build   # adapters must be built first
  pnpm authhero test
  pnpm --filter <pkg> exec vitest run <file>
-->

## Anything a reviewer should look at closely?

<!--
Optional. Judgement calls, behaviour changes to shared helpers, anything you
were unsure about. Call out explicitly if this PR touches:

  - the adapter contract in `@authhero/adapter-interfaces` (every adapter has
    to implement it)
  - database schema or migrations (kysely / drizzle)
  - token validation, password handling, or session semantics
-->
