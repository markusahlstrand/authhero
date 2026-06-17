import { Check, Minus, Server, Cloud } from "lucide-react";
import FadeIn from "@/components/FadeIn";
import GridBackground from "@/components/GridBackground";
import SpotlightCard from "@/components/SpotlightCard";
import EarlyAccessDialog from "@/components/EarlyAccessDialog";
import ContactDialog from "@/components/ContactDialog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CLOUD,
  COMMERCIAL_LICENSE_PER_YEAR,
  formatMau,
  formatPrice,
  formatRate,
  proMonthlyCost,
  CURRENCY,
} from "@/lib/pricing";

// --- Tier definitions (driven by the pricing config) ------------------------

interface Tier {
  name: string;
  price: string;
  cadence?: string;
  desc: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
}

const selfHostedTiers: Tier[] = [
  {
    name: "Community",
    price: "Free",
    desc: "The full AuthHero engine under AGPLv3. No MAU metering, no feature gates.",
    features: [
      "Every feature — no paywalls",
      "Unlimited monthly active users",
      "Run on any infrastructure you control",
      "AGPLv3 license (copyleft)",
      "Community support",
    ],
    cta: (
      <Button variant="outline" size="lg" className="w-full" asChild>
        <a
          href="https://github.com/markusahlstrand/authhero"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
      </Button>
    ),
  },
  {
    name: "Commercial / Sovereign",
    price: formatPrice(COMMERCIAL_LICENSE_PER_YEAR),
    cadence: "/year",
    desc: "A flat annual license that removes the AGPL copyleft obligation and includes support.",
    featured: true,
    features: [
      "Removes AGPLv3 copyleft requirements",
      "Deploy on EU-owned infra (Hetzner, OVH, Scaleway, on-prem)",
      "EU sovereignty — no US provider in the control path",
      "Customer-managed encryption / crypto-shredding PII vault",
      "Commercial support included",
      "Optional SLA (separate line item)",
    ],
    cta: (
      <ContactDialog size="lg" className="w-full" topic="Commercial / Sovereign">
        Contact us
      </ContactDialog>
    ),
  },
];

const cloudTiers: Tier[] = [
  {
    name: "Free",
    price: "Free",
    desc: "Get started on managed AuthHero Cloud, hosted on Cloudflare.",
    features: [
      `Up to ${formatMau(CLOUD.free.mau)} monthly active users`,
      `${CLOUD.free.ssoConnections} SSO connection`,
      "Community support",
    ],
    cta: (
      <EarlyAccessDialog size="lg" className="w-full">
        Sign up free
      </EarlyAccessDialog>
    ),
  },
  {
    name: "Pro",
    price: formatPrice(CLOUD.pro.basePerMonth),
    cadence: "/month",
    featured: true,
    desc: `Flat base fee including ${formatMau(CLOUD.pro.includedMau)} MAU, then linear ${formatRate(
      CLOUD.pro.mauOverage,
    )}/MAU — no tiered cliffs.`,
    features: [
      `${formatMau(CLOUD.pro.includedMau)} MAU included`,
      `Then ${formatRate(CLOUD.pro.mauOverage)} per MAU, billed linearly`,
      `${CLOUD.pro.ssoConnections} SSO connections`,
      "Customer-managed encryption / crypto-shredding PII vault",
      "Email support",
    ],
    cta: (
      <EarlyAccessDialog size="lg" className="w-full">
        Start with Pro
      </EarlyAccessDialog>
    ),
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "For teams with compliance, scale and support requirements beyond Pro.",
    features: [
      "Everything in Pro",
      "SLA & named support",
      "Dedicated / isolated deployment",
      "Customer-managed encryption / crypto-shredding PII vault",
      "Bundles the commercial license",
    ],
    cta: (
      <ContactDialog variant="outline" size="lg" className="w-full" topic="Enterprise">
        Contact us
      </ContactDialog>
    ),
  },
];

const TierCard = ({ tier }: { tier: Tier }) => (
  <SpotlightCard
    className={`flex h-full flex-col ${tier.featured ? "ring-1 ring-accent/40" : ""}`}
  >
    <div className="mb-4 flex items-center justify-between">
      <h3 className="font-semibold">{tier.name}</h3>
      {tier.featured && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
          Popular
        </span>
      )}
    </div>
    <div className="mb-1 flex items-baseline gap-1">
      <span className="text-3xl font-semibold">{tier.price}</span>
      {tier.cadence && (
        <span className="text-sm text-muted-foreground">{tier.cadence}</span>
      )}
    </div>
    <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
      {tier.desc}
    </p>
    <ul className="mb-8 space-y-3">
      {tier.features.map((feature) => (
        <li key={feature} className="flex items-start gap-2 text-sm">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-success"
            strokeWidth={1.5}
          />
          <span className="text-muted-foreground">{feature}</span>
        </li>
      ))}
    </ul>
    <div className="mt-auto">{tier.cta}</div>
  </SpotlightCard>
);

// --- Feature comparison matrix ----------------------------------------------

const matrixColumns = [
  "Community",
  "Commercial",
  "Cloud Free",
  "Cloud Pro",
  "Enterprise",
];

type CellValue = boolean | string;

const matrixRows: { feature: string; values: CellValue[] }[] = [
  {
    feature: "Monthly active users",
    values: [
      "Unlimited",
      "Unlimited",
      formatMau(CLOUD.free.mau),
      `${formatMau(CLOUD.pro.includedMau)}+`,
      "Custom",
    ],
  },
  {
    feature: "SSO connections",
    values: [
      "Unlimited",
      "Unlimited",
      String(CLOUD.free.ssoConnections),
      String(CLOUD.pro.ssoConnections),
      "Custom",
    ],
  },
  { feature: "MFA", values: [true, true, true, true, true] },
  {
    feature: "EU sovereignty",
    values: ["EU sovereign*", "EU sovereign*", false, false, false],
  },
  {
    feature: "Customer-managed keys (PII vault)",
    values: [true, true, false, true, true],
  },
  { feature: "SLA", values: [false, "Optional", false, false, true] },
  {
    feature: "Support",
    values: ["Community", "Commercial", "Community", "Email", "Named"],
  },
  {
    feature: "License",
    values: [
      "AGPLv3",
      "Commercial",
      "Managed",
      "Managed",
      "Managed + commercial",
    ],
  },
];

const MatrixCell = ({ value }: { value: CellValue }) => {
  if (value === true)
    return <Check className="mx-auto h-4 w-4 text-success" strokeWidth={1.5} />;
  if (value === false)
    return (
      <Minus
        className="mx-auto h-4 w-4 text-muted-foreground/40"
        strokeWidth={1.5}
      />
    );
  return <span className="text-sm text-muted-foreground">{value}</span>;
};

// --- Auth0 cost comparison (linear, no growth penalty) ----------------------

const sampleMau = [CLOUD.pro.includedMau, 100_000, 250_000, 500_000];

// --- FAQ --------------------------------------------------------------------

const faqs = [
  {
    q: "Is AuthHero Cloud EU-sovereign?",
    a: (
      <>
        <p className="mb-3">
          No — and we won't claim otherwise. AuthHero Cloud runs on Cloudflare,
          which is a US-headquartered company whose parent remains subject to US
          law (the CLOUD Act and FISA 702). That rules out a genuine
          <strong> sovereignty</strong> claim for the managed tiers.
        </p>
        <p className="mb-3">
          If you need genuine sovereignty — no US provider anywhere in the
          control path — run the self-hosted{" "}
          <strong>Commercial / Sovereign</strong> tier on EU-owned
          infrastructure (Hetzner, OVH, Scaleway or your own data center).
        </p>
        <p>
          On Pro and above, the customer-managed encryption / crypto-shredding
          PII vault keeps the encryption keys with you in the EEA, so even a
          compelled disclosure yields ciphertext rather than readable personal
          data.
        </p>
      </>
    ),
  },
  {
    q: "Can I migrate from Auth0?",
    a: (
      <p>
        Yes. AuthHero implements the Auth0 management and authentication APIs,
        so it's designed as a drop-in replacement — point your existing SDKs and
        integrations at AuthHero and keep your flows. See the migration guide
        for the details of moving users, clients and connections across.
      </p>
    ),
  },
  {
    q: "What does the commercial license change vs AGPL?",
    a: (
      <p>
        The Community edition is licensed under <strong>AGPLv3</strong>, whose
        copyleft terms require you to release the source of derivative works
        (including over a network). The <strong>Commercial</strong> license
        removes that copyleft obligation so you can embed and distribute
        AuthHero in closed-source products, and it includes commercial support
        (with an optional SLA). The feature set is identical — the license
        governs your obligations, not what AuthHero can do.
      </p>
    ),
  },
];

const Pricing = () => (
  <main>
    {/* Hero */}
    <GridBackground>
      <section className="container py-28 text-center md:py-36">
        <FadeIn>
          <h1 className="mb-4 text-4xl font-semibold md:text-5xl">Pricing</h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Let us host it, or run it yourself. Predictable, linear pricing with
            no per-MAU growth cliff.
          </p>
        </FadeIn>
      </section>
    </GridBackground>

    {/* Axis 1 — AuthHero Cloud */}
    <section className="container pb-24">
      <FadeIn>
        <div className="mb-2 flex items-center gap-2">
          <Cloud className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <h2 className="text-2xl font-semibold">AuthHero Cloud</h2>
        </div>
        <p className="mb-8 text-sm text-muted-foreground">
          Managed and hosted on Cloudflare.
        </p>
      </FadeIn>
      <div className="grid gap-6 md:grid-cols-3">
        {cloudTiers.map((tier, i) => (
          <FadeIn key={tier.name} delay={i * 0.1} className="h-full">
            <TierCard tier={tier} />
          </FadeIn>
        ))}
      </div>
    </section>

    {/* Axis 2 — Self-hosted */}
    <section className="container pb-24">
      <FadeIn>
        <div className="mb-8 flex items-center gap-2">
          <Server className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <h2 className="text-2xl font-semibold">Self-hosted</h2>
        </div>
      </FadeIn>
      <div className="grid gap-6 md:grid-cols-2">
        {selfHostedTiers.map((tier, i) => (
          <FadeIn key={tier.name} delay={i * 0.1} className="h-full">
            <TierCard tier={tier} />
          </FadeIn>
        ))}
      </div>
    </section>

    {/* Comparison matrix */}
    <section className="container pb-24">
      <FadeIn>
        <h2 className="mb-8 text-center text-2xl font-semibold">
          Compare every tier
        </h2>
        <div className="hairline overflow-x-auto rounded-lg">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Feature
                </th>
                {matrixColumns.map((col) => (
                  <th key={col} className="px-4 py-3 text-center font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-border transition-colors last:border-0 hover:bg-secondary/30"
                >
                  <td className="px-4 py-3 font-medium">{row.feature}</td>
                  {row.values.map((value, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      <MatrixCell value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          * Sovereignty applies to self-hosted deployments on EU-owned
          infrastructure. Cloud tiers run on Cloudflare — see the FAQ.
        </p>
      </FadeIn>
    </section>

    {/* Auth0 cost comparison — predictable linear pricing */}
    <section className="container pb-24">
      <FadeIn>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-2xl font-semibold">
            Pricing that doesn't punish growth
          </h2>
          <p className="mb-8 text-muted-foreground">
            Above the included {formatMau(CLOUD.pro.includedMau)} MAU, Cloud Pro
            bills a flat {formatRate(CLOUD.pro.mauOverage)} for every additional
            MAU — a straight line. There are no tier boundaries to cross and no
            step jumps in your bill as you scale, unlike the bracketed per-MAU
            curve typical of legacy providers like Auth0.
          </p>
        </div>
        <div className="hairline mx-auto max-w-2xl rounded-lg p-8">
          <p className="mb-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
            AuthHero Cloud Pro — estimated monthly cost
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {sampleMau.map((mau) => (
              <div key={mau} className="text-center">
                <div className="mb-1 text-2xl font-semibold text-accent">
                  {CURRENCY}
                  {Math.round(proMonthlyCost(mau)).toLocaleString("en-US")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatMau(mau)} MAU
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {formatPrice(CLOUD.pro.basePerMonth)}/mo base +{" "}
            {formatRate(CLOUD.pro.mauOverage)} × (MAU above{" "}
            {formatMau(CLOUD.pro.includedMau)}). Same rate at 60k or 600k — no
            growth penalty.
          </p>
        </div>
      </FadeIn>
    </section>

    {/* FAQ */}
    <section className="container pb-24">
      <FadeIn>
        <h2 className="mb-8 text-center text-2xl font-semibold">
          Frequently asked questions
        </h2>
        <div className="mx-auto max-w-2xl">
          <Accordion type="single" collapsible>
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </FadeIn>
    </section>

    {/* CTA */}
    <section className="border-t border-border">
      <div className="container py-24 text-center">
        <FadeIn>
          <h2 className="mb-4 text-2xl font-semibold md:text-3xl">
            Ready to own your auth?
          </h2>
          <p className="mx-auto mb-8 max-w-md text-muted-foreground">
            Start free on the cloud, or self-host the open-source engine today.
          </p>
          <div className="flex justify-center gap-3">
            <EarlyAccessDialog size="lg">
              Get Started for Free
            </EarlyAccessDialog>
            <ContactDialog variant="outline" size="lg" topic="General">
              Talk to us
            </ContactDialog>
          </div>
        </FadeIn>
      </div>
    </section>
  </main>
);

export default Pricing;
