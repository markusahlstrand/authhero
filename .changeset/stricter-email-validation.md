---
"authhero": patch
---

Tighten email validation. A shared `isValidEmail` helper replaces the loose `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` regex at three call sites (`flow-api`, `screen-api`, identifier-classification in `username.ts`); it rejects leading/trailing/consecutive dots and requires a 2+ character alphabetic TLD, catching common typos like `gmail..com` and `.user@x.com` that downstream senders reject. The IdentifierPage now also renders `<input type="email">` when email is the only accepted identifier so the browser blocks malformed addresses before submission; mixed phone/username flows stay on `type="text"`.
