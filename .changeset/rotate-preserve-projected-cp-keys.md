---
"authhero": patch
---

Signing-key rotation no longer revokes public-only control-plane keys. In a WFP
tenant, the control plane's verify keys are projected with private material
stripped (`pkcs7` null). Rotating in control-plane scope previously revoked
those projected copies too, severing verification of control-plane admin tokens
while the control plane kept signing with them. Rotation now only revokes keys
the scope actually signs with (private material present).
