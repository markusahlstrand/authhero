# Licensing

AuthHero is **dual-licensed**:

1. **AGPL-3.0-only** — the default, open-source license (see [LICENSE](./LICENSE)).
   You may use, modify, and self-host AuthHero freely. If you provide AuthHero as a
   network service, the AGPL requires you to make your modified source available to
   the users of that service.
2. **Commercial license** — for organizations that want to run or embed AuthHero
   without AGPL obligations (e.g. offering it as part of a proprietary SaaS).
   Contact **Markus Ahlstrand** at <markus@sesamy.com>, or open a
   [GitHub discussion](https://github.com/markusahlstrand/authhero/discussions),
   to obtain one.

## Per-package licenses

Not everything is AGPL. The surfaces you _integrate with_ are deliberately permissive:
using the MIT-licensed packages below on their own imposes no AGPL obligations on your
code. Use of the AGPL-licensed packages themselves remains subject to AGPL-3.0-only
(or a commercial license):

| Package                                                                                                  | License       | Why                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `authhero` (core server)                                                                                 | AGPL-3.0-only | the product                                                              |
| `@authhero/kysely-adapter`, `@authhero/drizzle`, `@authhero/aws-adapter`, `@authhero/cloudflare-adapter` | AGPL-3.0-only | part of the server runtime                                               |
| `@authhero/saml`, `@authhero/multi-tenancy`, `@authhero/proxy`                                           | AGPL-3.0-only | part of the server runtime                                               |
| `@authhero/admin`                                                                                        | AGPL-3.0-only | the admin UI                                                             |
| **`@authhero/adapter-interfaces`**                                                                       | **MIT**       | the adapter contract — write your own adapters without AGPL obligations  |
| **`create-authhero`** (and the projects it scaffolds)                                                    | **MIT**       | your scaffolded app is _your_ code                                       |
| **`@authhero/widget`**                                                                                   | **MIT**       | embedded in your login pages — embedding it imposes nothing on your site |

Each published package carries its own `LICENSE` file and `license` field; the
package-level declaration is authoritative for that package.

## Prior versions

Versions published to npm **before** the license change remain available under their
original MIT terms. This change applies from the versions that carry it onward.

## Contributions

Contributions are welcomed under a **Contributor License Agreement** ([CLA.md](./CLA.md))
that grants the maintainer the right to distribute your contribution under both of the
licenses above — that grant is what keeps the dual-licensing model possible. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

The CLA applies to **all contributions to this repository from the point this licensing
model was introduced** (the commit adding CLA.md and this file), regardless of which
package a contribution touches — including the MIT-licensed packages. The grant covers
distribution under AGPL-3.0-only, MIT, and proprietary/commercial terms, which is what
allows contributions to be shipped in both the open-source and commercially licensed
editions. Contributions made before that point were accepted under the repository's
then-current MIT license and are not retroactively covered by the CLA.

Copyright (c) 2024–2026 Markus Ahlstrand and contributors.
Prior contributions were made under the MIT license; the original MIT copyright and
permission notice is preserved in [NOTICE](./NOTICE), as the MIT license requires.
The MIT license's sublicensing grant is what permits redistributing that earlier
work under the AGPL and commercial licenses.
