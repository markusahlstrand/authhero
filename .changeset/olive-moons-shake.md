---
"@authhero/widget": patch
"authhero": patch
---

Fix the u2 login card collapsing to a sliver on phones when the tenant uses a custom universal-login template.

Below 480px the page widens the card with `width: 100% !important`, and a percentage width needs a definite containing block to resolve against. The page body is a **row** flex box centring one item, and a row flex item is sized by its content — so the percentage only resolves when the widget's container *is* that flex item, which is exactly the shape of the default template.

A custom template that wraps the widget in its own element — a `<main>`, say — puts a content-sized box in between. The percentage turns cyclic, the card shrink-to-fits to its min-content width, and a 375px phone renders a 243px card floating in the middle of the screen. It also came out narrower than before the phone rules landed, because the inline `clamp(320px, 100%, 400px)` those rules override had a 320px floor.

Under the breakpoint the body is now a **column** flex box with `align-items: stretch`. The cross axis becomes horizontal, so every in-flow wrapper between the body and the widget inherits the body's width and the percentages below it have a definite box to resolve against — whatever markup the template puts in between. On a 375px phone the card goes from 243px to 335px (the full width inside the page's 20px gutters); with no page background image it stays edge-to-edge. The fixed-position corner chips and the footer bar are out of flow and unaffected, and nothing changes at 481px and up, where the card keeps its 400px width.
