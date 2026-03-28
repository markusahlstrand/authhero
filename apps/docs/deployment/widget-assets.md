# Widget Assets

The AuthHero widget is a Stencil.js web component that provides the UI for universal login. This guide explains how to serve widget assets on different platforms.

## Overview

The widget consists of:
- `authhero-widget.esm.js` - ES module bundle (~200KB)
- `authhero-widget.js` - UMD bundle
- `*.css` - Component styles
- `assets/` - Icons, fonts, images

All requests to `/u/widget/*` must be routed to these files.

## How Widget Serving Works

### Local/Node.js/Bun

Files served directly from `node_modules`:

```typescript
import { serveStatic } from "@hono/node-server/serve-static";

widgetHandler: serveStatic({
  root: "./node_modules/authhero/dist/assets/u/widget",
  rewriteRequestPath: (p) => p.replace("/u/widget", ""),
})
```

**Why it works:**
- Filesystem access available at runtime
- Direct file serving from node_modules
- No build step needed

### Cloudflare Workers

Files must be copied during build:

```toml
# wrangler.toml
[assets]
directory = "./dist/assets"
```

**Why it's different:**
- No filesystem access at runtime
- Cannot serve from node_modules
- Assets bundled with worker
- Requires copy-assets build step

See [Cloudflare deployment guide](./cloudflare) for setup.

### AWS Lambda

Best served from S3/CloudFront:

```typescript
widgetHandler: async (c) => {
  const file = c.req.path.replace("/u/widget/", "");
  return fetch(`https://cdn.example.com/widget/${file}`);
}
```

**Why:**
- Lambda has limited bundle size (250MB unzipped)
- Cold starts faster without assets
- CDN provides better caching
- S3 storage is cheaper

## Platform-Specific Guides

### Node.js / Bun / Deno

**Setup:**

```typescript
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: serveStatic({
    // Use absolute path
    root: path.resolve(__dirname, "../node_modules/authhero/dist/assets/u/widget"),
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});
```

**Troubleshooting:**

If widget doesn't load:
1. Check the path is correct
2. Verify files exist: `ls node_modules/authhero/dist/assets/u/widget/`
3. Check browser console for 404s

### Cloudflare Workers

**Setup:**

1. **Create copy-assets.js:**

```javascript
#!/usr/bin/env node
import fs from "fs";
import path from "path";

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy authhero assets
const sourceDir = path.join(process.cwd(), "node_modules/authhero/dist/assets");
const targetDir = path.join(process.cwd(), "dist/assets");

copyDirectory(sourceDir, targetDir);

// Copy widget
const widgetSource = path.join(
  process.cwd(),
  "node_modules/@authhero/widget/dist/authhero-widget"
);
const widgetTarget = path.join(targetDir, "u/widget");

if (fs.existsSync(widgetSource)) {
  copyDirectory(widgetSource, widgetTarget);
}

console.log("✅ Assets copied");
```

2. **Configure wrangler.toml:**

```toml
[assets]
directory = "./dist/assets"
```

3. **Add to package.json:**

```json
{
  "scripts": {
    "copy-assets": "node copy-assets.js",
    "dev": "npm run copy-assets && wrangler dev",
    "deploy": "npm run copy-assets && wrangler deploy"
  }
}
```

4. **Application code (no widgetHandler needed):**

```typescript
const { app } = initMultiTenant({
  dataAdapter,
  // Wrangler serves assets automatically
});
```

**Troubleshooting:**

If `/u/widget/authhero-widget.esm.js` returns 404:

```bash
# 1. Ensure copy-assets ran
npm run copy-assets

# 2. Check files were copied
ls -la dist/assets/u/widget/

# 3. Verify wrangler.toml has [assets]
cat wrangler.toml | grep -A1 "assets"

# 4. Redeploy
npm run deploy
```

### AWS Lambda + S3

**Setup:**

1. **Upload widget to S3:**

```bash
# Copy widget files locally first
mkdir -p widget-upload
cp -r node_modules/authhero/dist/assets/u/widget/* widget-upload/

# Upload to S3
aws s3 sync widget-upload/ s3://your-bucket/widget/ \
  --acl public-read \
  --cache-control "public, max-age=31536000"
```

2. **Optional: Set up CloudFront:**

```bash
# Create CloudFront distribution
aws cloudfront create-distribution \
  --origin-domain-name your-bucket.s3.amazonaws.com \
  --default-root-object index.html
```

3. **Application code:**

```typescript
const WIDGET_CDN = process.env.WIDGET_CDN || 
  "https://your-bucket.s3.amazonaws.com/widget";

const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: async (c) => {
    const file = c.req.path.replace("/u/widget/", "");
    const url = `${WIDGET_CDN}/${file}`;
    
    // Proxy request
    const response = await fetch(url);
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/javascript",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  },
});
```

**Or redirect instead of proxy:**

```typescript
widgetHandler: async (c) => {
  const file = c.req.path.replace("/u/widget/", "");
  return c.redirect(`${WIDGET_CDN}/${file}`);
}
```

### AWS ECS/Fargate

Same as Node.js - serve from filesystem:

```typescript
import { serveStatic } from "@hono/node-server/serve-static";

const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: serveStatic({
    root: "./node_modules/authhero/dist/assets/u/widget",
    rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  }),
});
```

Widget files are included in Docker image.

## CDN Deployment

For production, consider hosting widget on a CDN for better performance.

### Benefits

- **Faster load times** - Served from edge locations
- **Reduced server load** - Assets don't hit your app
- **Better caching** - Long cache times, automatic invalidation
- **Smaller deploys** - Don't bundle assets with app

### Setup

1. **Upload to CDN storage:**

```bash
# Cloudflare R2
wrangler r2 object put my-bucket/widget/authhero-widget.esm.js \
  --file node_modules/authhero/dist/assets/u/widget/authhero-widget.esm.js

# AWS S3 (shown above)
# Google Cloud Storage
gsutil -m cp -r node_modules/authhero/dist/assets/u/widget/* \
  gs://your-bucket/widget/

# Azure Blob Storage
az storage blob upload-batch \
  --destination widget \
  --source node_modules/authhero/dist/assets/u/widget/
```

2. **Configure CDN:**

- Cloudflare R2: Automatic CDN
- AWS S3: Use CloudFront
- GCS: Use Cloud CDN
- Azure: Use Azure CDN

3. **Update application:**

```typescript
const { app } = initMultiTenant({
  dataAdapter,
  widgetHandler: async (c) => {
    const file = c.req.path.replace("/u/widget/", "");
    return c.redirect(`https://cdn.example.com/widget/${file}`);
  },
});
```

### Versioning

Add version to URL for cache busting:

```typescript
// In u2-routes.ts, update widget script tag
const widgetVersion = "1.0.0"; // from package.json
const scriptUrl = `/u/widget/authhero-widget.esm.js?v=${widgetVersion}`;
```

Or use content hash:

```bash
# Generate hash of widget file
HASH=$(sha256sum authhero-widget.esm.js | cut -d' ' -f1 | cut -c1-8)
# Upload as authhero-widget.HASH.esm.js
```

## Required Files

Minimal widget deployment requires:

```
u/widget/
├── authhero-widget.esm.js       (Required - ES module)
├── authhero-widget.css          (Required - Styles)
├── assets/                       (Optional - Icons)
│   ├── icon-*.svg
│   └── ...
└── authhero-widget.js           (Optional - UMD bundle)
```

Most deployments only need `.esm.js` and `.css`.

## CORS Configuration

If serving from a different domain, configure CORS:

**S3 CORS:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://auth.example.com"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

**CloudFront:**
```json
{
  "ResponseHeadersPolicyConfig": {
    "CorsConfig": {
      "AccessControlAllowOrigins": {
        "Items": ["https://auth.example.com"]
      },
      "AccessControlAllowMethods": {
        "Items": ["GET"]
      }
    }
  }
}
```

## Testing

Verify widget loads correctly:

```bash
# Check widget file is accessible
curl https://auth.example.com/u/widget/authhero-widget.esm.js

# Should return JavaScript code, not 404

# Check browser console
# Visit: https://auth.example.com/u2/login/identifier?state=test
# Console should show no errors
```

## Performance Optimization

### Compression

Enable gzip/brotli compression:

```nginx
# nginx
gzip on;
gzip_types application/javascript text/css;
```

```javascript
// Cloudflare Workers (automatic)
// Assets served via [assets] are compressed automatically
```

### Cache Headers

```typescript
widgetHandler: serveStatic({
  root: "./node_modules/authhero/dist/assets/u/widget",
  rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  onFound: (path, c) => {
    // Cache for 1 year (immutable assets)
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  },
})
```

### Preloading

Add to HTML `<head>`:

```html
<link rel="preload" href="/u/widget/authhero-widget.esm.js" as="script">
<link rel="preload" href="/u/widget/authhero-widget.css" as="style">
```

## Troubleshooting

### Widget shows "Loading..." forever

**Possible causes:**
1. JavaScript file not loading (404)
2. CORS blocking the request
3. JavaScript error

**Debug steps:**
```bash
# 1. Check browser console for errors
# 2. Check network tab for failed requests
# 3. Verify widget file loads:
curl -I https://auth.example.com/u/widget/authhero-widget.esm.js
```

### Styling looks broken

**Possible causes:**
1. CSS file not loading
2. Content-Type header wrong
3. Path mismatch

**Fix:**
```typescript
// Ensure CSS served with correct content-type
widgetHandler: serveStatic({
  root: "./widget",
  rewriteRequestPath: (p) => p.replace("/u/widget", ""),
  mimes: {
    css: "text/css",
    js: "application/javascript",
  },
})
```

### Works locally but not in production

**Common issues:**
1. Forgot to run copy-assets (Cloudflare)
2. S3 bucket not public (AWS)
3. Wrong path in production
4. Assets not included in Docker image

**Solutions:**
- Cloudflare: Add `copy-assets` to deploy script
- AWS: Check S3 bucket policy
- Docker: Verify `COPY` includes node_modules

## Next Steps

- [Local deployment](./local)
- [Cloudflare deployment](./cloudflare)
- [AWS deployment](./aws)
- [Multi-cloud setup](./multi-cloud)
