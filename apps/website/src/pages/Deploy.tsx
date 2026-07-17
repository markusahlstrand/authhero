import { Server, Cpu, Zap } from "lucide-react";
import FadeIn from "@/components/FadeIn";
import GridBackground from "@/components/GridBackground";
import SpotlightCard from "@/components/SpotlightCard";
import { docs } from "@/lib/links";

const architectures = [
  {
    icon: Cpu,
    title: "In-Process Node Library",
    desc: "Import AuthHero as a module. Auth runs inside your application process — no network hop between your app and your auth layer.",
    tag: "Recommended",
    href: docs("/customization/installation"),
  },
  {
    icon: Server,
    title: "Standalone Container",
    desc: "Deploy AuthHero as a separate Docker container. Full API compatibility with Auth0 endpoints.",
    tag: "Docker",
    href: docs("/deployment/docker"),
  },
  {
    icon: Zap,
    title: "Edge Runtime",
    desc: "Run on Cloudflare Workers or Vercel Edge Functions. Sub-millisecond cold starts, global distribution.",
    tag: "Edge",
    href: docs("/deployment/cloudflare"),
  },
];

const Deploy = () => (
  <main>
    <GridBackground>
      <section className="container py-28 md:py-36 text-center">
        <FadeIn>
          <h1 className="text-4xl md:text-5xl font-semibold mb-4">
            Architecture & Deployment
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Choose your deployment model. Every option gives you full data
            sovereignty.
          </p>
        </FadeIn>
      </section>
    </GridBackground>

    <section className="container pb-24">
      <div className="grid md:grid-cols-3 gap-6">
        {architectures.map((a, i) => (
          <FadeIn key={a.title} delay={i * 0.1}>
            <a
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group block h-full"
            >
              <SpotlightCard className="h-full">
                <div className="flex items-center gap-2 mb-4">
                  <a.icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
                  <span className="text-xs text-muted-foreground hairline rounded-full px-2 py-0.5">
                    {a.tag}
                  </span>
                </div>
                <h3 className="font-semibold mb-2 group-hover:text-accent transition-colors">
                  {a.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {a.desc}
                </p>
              </SpotlightCard>
            </a>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={0.3}>
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Why In-Process Auth Matters
          </h2>
          <div className="max-w-2xl mx-auto hairline rounded-lg p-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
              Network round-trip per auth request
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-3xl font-semibold text-accent mb-1">
                  ~0ms
                </div>
                <div className="text-muted-foreground">
                  AuthHero (in-process)
                </div>
              </div>
              <div className="text-muted-foreground/40 text-2xl font-light">
                vs
              </div>
              <div className="text-center">
                <div className="text-3xl font-semibold text-muted-foreground mb-1">
                  50–200ms
                </div>
                <div className="text-muted-foreground">
                  External auth provider
                </div>
              </div>
            </div>
            <p className="text-muted-foreground text-sm mt-6">
              Every authentication request to an external provider adds a
              network round-trip. AuthHero eliminates that hop by running in
              your process — you still pay the auth compute, just not the
              network latency.
            </p>
          </div>
        </div>
      </FadeIn>
    </section>
  </main>
);

export default Deploy;
