---
"@authhero/proxy": patch
---

Forward small request bodies as a buffer instead of a stream. An upstream that answers a POST without reading the body — a 404, a redirect, a cached response — left the forwarded stream half-pumped, and returning its response made the Workers runtime log `Can't read from request stream after response has been sent.` against a request that otherwise succeeded. Bodies with a declared `content-length` at or below 128 KiB are now read up front (and the header restated from what actually arrived); larger or chunked bodies still stream.
