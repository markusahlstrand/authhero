Before I tell you what AuthHero is, I should tell you how bad I used to be at this.

Our very first auth system signed its tokens with a symmetric key. If that doesn't make you wince yet, here's why it should: anything in the system that could verify a token could also forge one. There was no separation between checking a token and minting one. The most boring read-only service we ran was, quietly, a key to the entire kingdom. I knew just enough about auth to get myself into trouble, and nowhere near enough to know I was in it.

I suspect I'm not the only person reading this who has shipped auth they're a little ashamed of. Good. Then you'll recognise the rest of this, because it's a story about being wrong about authentication over and over, and what each wrong turn eventually taught me.

## The years we rented it

After enough self-inflicted wounds, we did the sensible thing and stopped writing our own. We rented it instead.

First Cognito. Cognito and our mental model never quite met, and we spent more time working around it than with it. So we moved to Auth0, which was genuinely good, better than anything we'd built ourselves. And yet we were always fighting it. We wanted to own our own login UI instead of the hosted one. We kept bumping into corners of the API we were sure were silly.

Looking back, the same thing happened every single time, with every vendor: their model of how authentication should work was never quite our model. That collision is the whole story. Hold onto it, because it's what eventually made building our own a reasonable decision rather than pure engineering arrogance.

## A seam, built by accident

Because we wanted our own login screen, we started building a thin layer on top of Auth0 and minting our own tokens from it.

I want to be honest about why, because it matters later. We did not do this as part of some grand plan to become independent. We did it for one small, almost trivial reason: we wanted to control the UI. That's it.

But without noticing, we had just built a seam, a boundary between our application and the thing actually doing the authentication. Remember that seam. It was built for the wrong reason, and it's the one that saved us.

## "How hard could it be?"

Then the enterprise invoice arrived.

We hit the tier where the price steps up, looked at the number, looked at each other, and said the single most dangerous sentence in our industry: how hard could it be?

Reader: it was harder than we thought. Authentication is one of those problems that looks small from the outside and is mostly iceberg. Most of the respect I now have for it, I earned by trying to replace it and finding out.

## We were wrong about Auth0

Here is what building it actually taught me. Every decision in Auth0 that I'd rolled my eyes at turned out to be load-bearing.

We hadn't disliked Auth0 because it was bad. We'd disliked it because we didn't understand it yet. The moment we tried to build our own, we discovered the reason behind each "silly" choice, usually the hard way, by making the opposite choice and watching it fail.

This is the oldest trap in software: you set out to build a better X, and you reinvent X. Best case, you arrive at exactly what you were criticising. More often, something worse.

So we did something that sounds backwards. We decided to keep the part of Auth0 we'd come to respect, and change everything underneath it.

## Keep the boundary. Change the substrate.

The API surface, we kept. The design was never the problem. The strongest thing I can say about Auth0's design is that we reimplemented it on purpose. AuthHero's Auth0 compatibility isn't a migration trick; it's us conceding that they got the interface right.

It happened incrementally, which is how you can tell it wasn't a master plan. We copied just the authentication API first, so our existing clients wouldn't have to change. It worked. So we copied the management API. Then the hosted login. We backed into a product one compatible endpoint at a time.

What we changed is everything the API doesn't touch: the price, who owns it, which jurisdiction it runs in, where it's deployed, and whether you can embed it in your own product. None of that lives in the API. All of it lives below the API, which is exactly the part we were finally free to rebuild once we stopped fighting the part Auth0 had right.

If you remember one sentence from this, make it that one: the boundary is the product. Get the boundary right, and migration, embedding, swapping the datastore, and testing in isolation all fall out of the same decision.

## On purpose, this time

Somewhere in there I stopped resenting auth and got genuinely interested in it. That's when we stepped back and rebuilt the thing as a principle instead of an accident.

It became a set of packages you embed inside your own application, rather than a server you stand up beside it. Everything external (the database, the email provider, the runtime) moved behind an adapter interface, so any of it can be swapped and the core never finds out. Multi-tenancy became its own package. None of this was extra work bolted on. Embeddability and portability fell out of taking the boundaries seriously.

## Picking the right level

There's a related decision people often frame as a preference, and I think that's the wrong frame. It's not that I dislike servers or containers. It's about choosing the right level of abstraction for what you're actually building.

What we're building is logic. Authentication is logic. Logic doesn't need to know which operating system it's on, what's inside the container, or which region the box sits in. So we don't take that dependency. JavaScript, or WASM, is usually the right level for logic, because it runs everywhere with nothing specific attached. The moment you reach for a heavier runtime, you've bound your logic to an environment it never needed.

Cloudflare Workers happen to be a clean place to run logic at that level, which is why AuthHero runs there well. But the appeal was never the brand. It was the level. And the proof is in what falls out. The same core runs as a Node container on SQLite, on Workers against a serverless database, or, because every dependency is an adapter, as a degraded "limp-mode" replica on a completely different cloud. We didn't build multi-cloud portability. We accepted a constraint, and portability was already there.

That same discipline is what lets the architecture scale to thousands of tenants, each physically isolated, for a cost measured in tens of dollars a month and close to zero operations. That isn't cleverness about cost. It's what happens when you keep choosing the level where cost stays small.

## The actual lesson

Look back over the whole thing and you'll notice every good property came from the same move, repeated.

Auth0's API was a constraint we stopped fighting, and it gave us compatibility and a painless migration path. The adapter seams were constraints we imposed on ourselves, and they gave us embeddability and the freedom to swap anything underneath. The logic level was a constraint we accepted, and it gave us an edge deployment that's cheap, global, and not locked to any one cloud.

Three constraints. Three disproportionate payoffs. One move.

Most engineering writing is about removing limits. This one isn't. The most leverage I've ever gotten came from accepting the right ones, and from refusing the pointless ones, like an environment dependency on code that's just logic. The boundary you add today for a small, almost trivial reason is the option you'll be grateful for in two years.

That boundary, it turns out, was the product all along.

---

AuthHero is an open-source, Auth0-compatible authentication server. It's MIT-licensed and [on GitHub](https://github.com/authhero). If you're fighting your auth provider's model the way we fought ours, it might be worth a look.
