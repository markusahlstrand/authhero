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

[Release creation process will be documented here]

## Publishing Packages

[Package publication process will be documented here]

## Post-Release Steps

[Post-release steps will be documented here]