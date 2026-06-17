import { Database, Users, Globe, ArrowRightLeft } from "lucide-react";
import SpotlightCard from "./SpotlightCard";
import FadeIn from "./FadeIn";
import { docs } from "@/lib/links";

const features = [
  {
    icon: Database,
    title: "Database Sovereignty",
    desc: "Your users live in your database. First-class support for Drizzle and Kysely ORMs.",
    href: docs("/database/"),
  },
  {
    icon: Users,
    title: "Advanced Impersonation",
    desc: "Support your users without workarounds. Re-imagined for B2B SaaS.",
    href: docs("/features/impersonation"),
  },
  {
    icon: Globe,
    title: "Edge-Ready",
    desc: "Deploy to Cloudflare Workers or Vercel Edge in one click.",
    href: docs("/deployment/cloudflare"),
  },
  {
    icon: ArrowRightLeft,
    title: "Familiar API. Full Compatibility.",
    desc: "AuthHero is API-compatible with the industry standard. Transition your existing apps by updating a single environment variable.",
    href: docs("/architecture/auth0-compatibility"),
  },
];

const BentoGrid = () => (
  <section className="container py-24">
    <FadeIn>
      <h2 className="text-2xl md:text-3xl font-semibold text-center mb-4">
        Built for the Modern Stack
      </h2>
      <p className="text-muted-foreground text-center max-w-xl mx-auto mb-12">
        Unrestricted Access. Every feature, from Impersonation to Organizations, is available on every tier. No "Contact Sales" hurdles.
      </p>
    </FadeIn>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden hairline">
      {features.map((f, i) => (
        <FadeIn key={f.title} delay={i * 0.08}>
          <a
            href={f.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block h-full"
          >
            <SpotlightCard className="rounded-none border-0 h-full">
              <f.icon className="h-5 w-5 text-accent mb-4" strokeWidth={1.5} />
              <h3 className="font-semibold mb-2 group-hover:text-accent transition-colors">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </SpotlightCard>
          </a>
        </FadeIn>
      ))}
    </div>
  </section>
);

export default BentoGrid;
