// AuthHero login → kernel principal. Deterministic, so the same person always
// lands on the same principal across deploys: an AuthHero access token's `sub`
// (e.g. "email|68a1…") derives the ULID-shaped principal that roles/grants are
// assigned to. Login proves WHO (the OIDC verify); the kernel decides WHAT.
//
// Same bridge shape as the CRM vertical's `principalForProfile`: prefix + the
// cleaned sub, coerced into the ULID alphabet (Crockford base32 — I/L/O/U → 0),
// padded/truncated to 26. Deterministic beats random here because the world can
// be reseeded while the IdP's users persist.
import {
  principalId as principalIdOf,
  type PrincipalId,
} from "@substrat-run/contracts";

export const principalForSub = (sub: string): PrincipalId =>
  principalIdOf.parse(
    (
      "0AH" +
      String(sub)
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
    )
      .replace(/[ILOU]/g, "0")
      .concat("0".repeat(26))
      .slice(0, 26),
  );

export const ROLE_OWNER = "platform-operator";
