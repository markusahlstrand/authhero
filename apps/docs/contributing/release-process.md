---
title: Release Process
description: AuthHero release process using Changesets for version management. Create changesets, follow versioning guidelines, and publish packages.
---

# Release Process

This document outlines the release process for the AuthHero project.

## Version Management

AuthHero uses Changesets for version management. Changesets allows you to:

- Track changes to packages
- Generate changelogs
- Bump version numbers
- Publish packages

## Creating a Changeset

When you make a change that requires a version bump, create a changeset:

```bash
pnpm changeset
```

This command will prompt you to:

1. Select the packages that have changed
2. Specify the type of version bump (major, minor, patch)
3. Provide a description of the changes

The changeset will be committed to the repository as a markdown file in the `.changeset` directory.

## Versioning Guidelines

- **Major version bump (1.0.0 -> 2.0.0)**: Breaking changes that require users to modify their code
- **Minor version bump (1.0.0 -> 1.1.0)**: New features or non-breaking changes
- **Patch version bump (1.0.0 -> 1.0.1)**: Bug fixes, documentation updates, or other non-functional changes

## Release Preparation

Before releasing, ensure that:

1. All tests pass
2. The build succeeds
3. Documentation is up to date
4. All changes have appropriate changesets

## Creating a Release

Releases are driven entirely by the `Release` workflow
(`.github/workflows/release.yml`), which runs on every push to `main`. There is
no manual release command — merging a PR that contains changesets is what starts
a release.

The workflow:

1. Installs dependencies and builds every package under `packages/**` with
   `pnpm -r --filter './packages/**' build` (topological order, so each package
   type-checks against its dependencies' freshly built `.d.ts` files). Note
   the filter's scope: nothing under `apps/` is built by this step, which
   matters for `@authhero/admin` — see below.
2. Runs [`changesets/action`](https://github.com/changesets/action).

When unreleased changesets are present in `.changeset/`, the action opens (or
updates) a pull request titled **`chore: version packages`**. That PR is
generated, not hand-written: it deletes the consumed `.changeset/*.md` files,
bumps each affected package's `version`, and appends the changeset descriptions
to the package's `CHANGELOG.md`.

Review the version PR the same way you'd review any other one — in particular
check that the bump types match the changes described. If a bump is wrong, fix
the changeset on `main` rather than editing the generated PR; the action will
regenerate it.

## Publishing Packages

Merging the `chore: version packages` PR pushes to `main` and re-runs the
workflow. This time there are no changesets left to consume, so the action runs
the publish step instead:

```bash
pnpm changeset publish
```

This publishes every package whose version is not yet on npm and pushes the
`<package>@<version>` git tags that `changeset publish` creates. Relevant
configuration:

- **Access** — `.changeset/config.json` sets `"access": "public"`, so scoped
  `@authhero/*` packages are published publicly.
- **Provenance** — the workflow sets `NPM_CONFIG_PROVENANCE: true` and requests
  the `id-token: write` permission, so releases carry npm provenance
  attestations linking them back to the workflow run.
- **Internal dependencies** — `updateInternalDependencies` is `patch` and
  `bumpVersionsWithWorkspaceProtocolOnly` is `true`, so a bump to
  `@authhero/adapter-interfaces` also patch-bumps the workspace packages that
  depend on it.
- **What is not published** — anything marked `"private": true` in its
  `package.json`. That covers the documentation site, the website, and the
  conformance runner. Everything else is released, including `@authhero/admin`,
  which lives under `apps/` but is a published package.

::: warning `@authhero/admin` is published but not built by the release job
`@authhero/admin` is not private and publishes its `dist` directory, but the
workflow's build step only covers `packages/**` and the package has no
`prepublishOnly` hook — so a release job builds no admin bundle. Build it
before relying on a published `@authhero/admin` tarball.
:::

## Post-Release Steps

After the publish job goes green:

1. **Verify the release landed on npm.** Check that the `latest` dist-tag
   matches the version in the repository, e.g.
   `npm view authhero version` and
   `npm view @authhero/drizzle version`. A publish can partially fail (for
   example on an npm outage); the git tag existing does not by itself prove the
   tarball is on the registry.
2. **Check the changelog.** `packages/<name>/CHANGELOG.md` should contain an
   entry for the new version with the changeset descriptions.
3. **Bump consumers.** Downstream deployments pin published versions rather
   than using the workspace, so update the dependency range in each consuming
   repository and deploy it. Adapter packages must be bumped together with
   `authhero` when a release changes the adapter contract.
4. **Check the conformance result.** The OpenID conformance workflow is
   _triggered_ on every pull request targeting `main`, so the required check is
   always reported — but its jobs are gated on
   `github.event_name == 'workflow_dispatch' || github.head_ref == 'changeset-release/main'`,
   so on any other PR they report as skipped and nothing actually runs. The
   version PR is therefore the only PR that produces a conformance result
   automatically; you can get one on any branch by running the workflow
   manually from the Actions tab (`workflow_dispatch`, which also takes a
   `grep` filter). If it was red, decide whether the failure is a real
   regression before advertising the release — see
   [Conformance](/standards/conformance).
