# Changesets Release Workflow

This repository uses [Changesets](https://github.com/changesets/changesets) for version management and package publishing.

## Setup

The release workflow is configured in `.github/workflows/release.yml` and will automatically:

1. Create a "Version Packages" PR when changesets are added
2. Publish packages to npm when the PR is merged

## Required Secrets

You need to configure the following secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### NPM_TOKEN (Required)

1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click your profile icon → "Access Tokens"
3. Click "Generate New Token" → "Automation"
4. Copy the token
5. Add it to GitHub Secrets as `NPM_TOKEN`

### GITHUB_TOKEN (Automatically provided)

This is automatically provided by GitHub Actions - no setup needed.

## How to Release

### 1. Create a Changeset

When you make changes that should be released, create a changeset:

```bash
pnpm changeset
```

This will:
- Ask you which packages changed
- Ask for the version bump type (major, minor, patch)
- Ask for a summary of changes

This creates a markdown file in `.changeset/` that describes the change.

### 2. Commit the Changeset

```bash
git add .changeset
git commit -m "chore: add changeset for feature X"
git push
```

### 3. Automated Release Process

When changesets are pushed to the `main` branch:

1. **GitHub Action runs** - The release workflow detects changesets
2. **PR is created** - A "Version Packages" PR is automatically created that:
   - Updates package versions
   - Updates CHANGELOG.md files
   - Removes consumed changeset files
3. **Review and merge** - Review the PR and merge it when ready
4. **Packages published** - When merged, packages are automatically published to npm

## Workflow Details

### Build Order

The workflow builds packages in the correct dependency order:

```bash
pnpm interfaces build  # @authhero/adapter-interfaces
pnpm saml build        # @authhero/saml
pnpm kysely build      # @authhero/kysely-adapter
pnpm drizzle build     # @authhero/drizzle-adapter
pnpm cloudflare build  # @authhero/cloudflare-adapter
pnpm authhero build    # authhero
```

### Published Packages

The following packages are published to npm:

- `authhero` - Main authentication package
- `@authhero/adapter-interfaces` - Database adapter interfaces
- `@authhero/kysely-adapter` - Kysely database adapter
- `@authhero/drizzle-adapter` - Drizzle ORM adapter
- `@authhero/cloudflare-adapter` - Cloudflare-specific adapter
- `@authhero/saml` - SAML authentication support
- `create-authhero` - CLI tool for scaffolding

### Provenance

The workflow uses `NPM_CONFIG_PROVENANCE: true` to publish packages with npm provenance, providing verifiable attestation of where and how packages were built.

## Changeset Configuration

Configuration is in `.changeset/config.json`:

- **access**: `public` - All packages are public
- **baseBranch**: `main` - Changesets are tracked from main
- **updateInternalDependencies**: `patch` - Internal deps get patch bumps

## Manual Publishing (Not Recommended)

If you need to publish manually:

```bash
# Build all packages
pnpm interfaces build
pnpm saml build
pnpm kysely build
pnpm drizzle build
pnpm cloudflare build
pnpm authhero build

# Version packages
pnpm changeset version

# Publish
pnpm changeset publish
```

## Troubleshooting

### "No changesets found"

You need to create a changeset first: `pnpm changeset`

### "Failed to publish package"

- Check that `NPM_TOKEN` is correctly set in GitHub Secrets
- Verify you have publish rights for the @authhero scope
- Check that package versions don't already exist on npm

### "Build failed"

Ensure the build order is correct - packages with dependencies must build after their dependencies.

## Tips

- Use `pnpm changeset status` to see pending changesets
- Use `pnpm changeset add` as an alias for `pnpm changeset`
- Multiple changesets can accumulate before release
- Changesets can span multiple packages in a single file
