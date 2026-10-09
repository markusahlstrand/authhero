---
"authhero": patch
---

Promote the remaining OIDC standard claims (`address`, `birthdate`, `locale`, `zoneinfo`, `middle_name`, `gender`, `website`, `profile`) from a social/enterprise IdP profile to the user's root attributes, following the connection's `set_user_root_attributes` mode. Previously they were only kept in `profileData`, so the `address` and `profile` scopes returned nothing for these users. Vipps phone numbers are now stored in E.164 format (`+47…`).
