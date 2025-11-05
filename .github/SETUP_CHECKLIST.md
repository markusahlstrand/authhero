# Changesets Release Setup - Quick Start

## ✅ Setup Checklist

### 1. GitHub Secrets Configuration

Add the following secret to your repository:

Go to: `https://github.com/markusahlstrand/authhero/settings/secrets/actions`

- [ ] **NPM_TOKEN**: Your npm automation token
  - Generate at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
  - Type: "Automation"
  - Scope: Read and Publish

### 2. NPM Organization/Package Access

Verify you have publish rights:

- [ ] Member of `@authhero` npm organization (or own it)
- [ ] Can publish to `authhero` package
- [ ] Can publish to `@authhero/*` scoped packages

### 3. Test the Workflow

Once secrets are configured:

```bash
# 1. Create a test changeset
pnpm changeset

# 2. Select a package (choose patch)
# 3. Add a summary like "test: verify release workflow"

# 4. Commit and push to main
git add .changeset
git commit -m "test: add changeset"
git push origin main
```

The workflow will automatically:
1. ✅ Create a "Version Packages" PR
2. ✅ Update versions and CHANGELOGs
3. ✅ When merged: Publish to npm

## 📋 Files Created/Modified

- ✅ `.github/workflows/release.yml` - Release automation
- ✅ `.changeset/config.json` - Updated to `access: "public"`
- ✅ `packages/authhero/package.json` - Added publishConfig
- ✅ `.github/RELEASE.md` - Full documentation

## 🚀 Daily Workflow

After setup, your release workflow is:

1. Make changes to packages
2. Run `pnpm changeset` to document changes
3. Commit changesets with your code
4. Push to main
5. Review auto-generated "Version Packages" PR
6. Merge PR → Automatic publish to npm

## 🔍 Verify Setup

Check that packages have proper config:

```bash
# All packages should show "private": false
grep -r "\"private\"" packages/*/package.json

# All scoped packages should have publishConfig
grep -A 5 "publishConfig" packages/*/package.json
```

## 📦 Packages That Will Be Published

- `authhero` - Main package
- `@authhero/adapter-interfaces`
- `@authhero/kysely-adapter`
- `@authhero/drizzle-adapter`
- `@authhero/cloudflare-adapter`
- `@authhero/saml`
- `create-authhero`

## ⚠️ Important Notes

1. **First Release**: The first run will version ALL packages if they have pending changesets
2. **Build Order**: Packages build in dependency order (interfaces → saml → adapters → authhero)
3. **Provenance**: Packages are published with npm provenance for security
4. **Concurrency**: Only one release workflow runs at a time (prevents conflicts)

## 🐛 Troubleshooting

If the workflow fails:

1. Check GitHub Actions logs: `https://github.com/markusahlstrand/authhero/actions`
2. Verify `NPM_TOKEN` is set correctly
3. Ensure token has "Automation" type (not "Publish")
4. Verify npm organization access
5. Check package names aren't already taken

## 📚 Learn More

- Full docs: `.github/RELEASE.md`
- Changesets docs: https://github.com/changesets/changesets
- Changesets action: https://github.com/changesets/action
