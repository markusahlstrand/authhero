import { Cloud, Server, Cpu } from "lucide-react";
import FadeIn from "./FadeIn";
import { docs } from "@/lib/links";

const options = [
  {
    id: "cloud",
    icon: Cloud,
    title: "AuthHero Cloud",
    badge: "Coming Soon",
    desc: "Global, high-availability, and SOC2-ready managed hosting. Launching soon.",
    href: docs("/roadmap"),
  },
  {
    id: "self-hosted",
    icon: Server,
    title: "Self-Hosted",
    desc: "Full data sovereignty. Deploy via Docker or Kubernetes on your own hardware.",
    href: docs("/deployment/docker"),
  },
  {
    id: "in-process",
    icon: Cpu,
    title: "In-Process Library",
    desc: "Zero network hops. Run auth as a native library within your Node/Hono/Next.js process.",
    href: docs("/customization/installation"),
  },
];

const DeploymentCards = () => (
  <section className="container py-20">
    <FadeIn>
      <p className="text-center text-sm text-muted-foreground uppercase tracking-widest mb-8">
        Deploy your way
      </p>
    </FadeIn>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
      {options.map((opt, i) => (
        <FadeIn key={opt.id} delay={i * 0.08}>
          <a
            href={opt.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block h-full w-full text-left p-6 rounded-lg hairline transition-all duration-300 hover:border-accent hover:bg-accent/5"
          >
            <div className="flex items-center gap-2 mb-3">
              <opt.icon
                className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors"
                strokeWidth={1.5}
              />
              <h3 className="font-semibold text-sm group-hover:text-accent transition-colors">{opt.title}</h3>
              {opt.badge && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {opt.badge}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{opt.desc}</p>
          </a>
        </FadeIn>
      ))}
    </div>
  </section>
);

export default DeploymentCards;
