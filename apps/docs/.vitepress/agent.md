# VitePress Documentation Guidelines

This document provides guidelines for contributing to the AuthHero documentation site.

## Markdown File Frontmatter

**All markdown files must include frontmatter with `title` and `description` fields.**

When creating or editing markdown files, always add frontmatter at the very top of the file:

```markdown
---
title: Page Title
description: A concise 1-2 sentence description of the page content for SEO purposes.
---

# Page Title

Content goes here...
```

### Guidelines for Frontmatter

1. **Title**: Should match or closely align with the main H1 heading of the page
2. **Description**: Write a concise, SEO-friendly description (150-160 characters ideal)
   - Describe what the reader will learn or find on this page
   - Include relevant keywords naturally
   - Make it actionable when possible

### Examples

```markdown
---
title: Getting Started
description: Learn how to install and configure AuthHero for your authentication needs in minutes.
---
```

```markdown
---
title: Multi-Tenancy Architecture
description: Understand how AuthHero handles multi-tenant isolation, subdomain routing, and database separation.
---
```

```markdown
---
title: Cloudflare Deployment
description: Step-by-step guide to deploying AuthHero on Cloudflare Workers with D1 database and KV storage.
---
```

## File Organization

- Place new documentation in the appropriate subdirectory
- Use lowercase filenames with hyphens (e.g., `custom-domain-setup.md`)
- Create an `index.md` for each directory to serve as the section landing page

## Code Examples

- Use syntax highlighting with language identifiers
- Include complete, runnable examples when possible
- Add comments to explain complex code sections

## Links

- Use relative paths for internal links
- Ensure all links are valid before committing
