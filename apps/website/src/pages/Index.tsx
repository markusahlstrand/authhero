import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import GridBackground from "@/components/GridBackground";
import TextGenerateEffect from "@/components/TextGenerateEffect";
import CodeWindow from "@/components/CodeWindow";
import BentoGrid from "@/components/BentoGrid";
import DeploymentCards from "@/components/DeploymentCards";
import FadeIn from "@/components/FadeIn";
import EarlyAccessDialog from "@/components/EarlyAccessDialog";
import { GITHUB_ORG_URL } from "@/lib/links";

const Index = () => (
  <main>
    {/* Hero */}
    <GridBackground>
      <section className="container flex flex-col items-center text-center py-28 md:py-40">
        <FadeIn>
          <div className="inline-flex items-center gap-2 hairline rounded-full px-3 py-1 text-xs text-muted-foreground mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Open Source · MIT Licensed
          </div>
        </FadeIn>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-semibold max-w-3xl leading-[1.1] mb-6">
          <TextGenerateEffect words="Identity that scales with your infrastructure." />
        </h1>

        <FadeIn delay={0.4}>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10 text-balance">
            A high-performance, Auth0-compatible engine. Deploy it as a standalone service, embed it directly into your Node process with no network round-trip, or use our upcoming managed cloud.
          </p>
        </FadeIn>

        <FadeIn delay={0.6}>
          <div className="flex gap-3">
            <EarlyAccessDialog size="lg">Get Started for Free</EarlyAccessDialog>
            <Button variant="outline" size="lg" asChild>
              <a href={GITHUB_ORG_URL} target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-4 w-4" strokeWidth={1.5} />
                View Open Source
              </a>
            </Button>
          </div>
        </FadeIn>
      </section>
    </GridBackground>

    {/* Deployment Flex */}
    <DeploymentCards />

    {/* Code Reveal */}
    <section className="container py-20">
      <FadeIn>
        <p className="text-center text-sm text-muted-foreground uppercase tracking-widest mb-2">
          Power user feature
        </p>
        <p className="text-center text-xs text-muted-foreground mb-8">
          Embed auth directly in your Node process — zero network hops
        </p>
      </FadeIn>
      <CodeWindow />
    </section>

    {/* Bento Grid */}
    <BentoGrid />

    {/* CTA */}
    <section className="border-t border-border">
      <div className="container py-24 text-center">
        <FadeIn>
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Ready to own your auth?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Deploy in minutes. Migrate from Auth0 in hours. Sleep better forever.
          </p>
          <EarlyAccessDialog size="lg">Get Started for Free</EarlyAccessDialog>
        </FadeIn>
      </div>
    </section>
  </main>
);

export default Index;
