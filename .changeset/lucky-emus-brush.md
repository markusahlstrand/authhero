---
"authhero": patch
---

Skip rollup-plugin-visualizer when building in CI. The gzip/brotli sizing pass was a significant share of build time, and dist/stats.html (previously included in the published tarball) is only useful locally.
