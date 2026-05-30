---
"authhero": patch
---

Fix social/enterprise login when field encryption is enabled. `createEncryptedDataAdapter` now also wraps `clientConnections.listByClient`, so connections loaded via `getEnrichedClient` come back with decrypted `options.client_secret`. Previously the encrypted ciphertext was passed straight to the upstream IdP's token endpoint, breaking every login through a client with explicitly-assigned connections.
