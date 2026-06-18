import { Check, X } from "lucide-react";
import FadeIn from "@/components/FadeIn";
import GridBackground from "@/components/GridBackground";

const rows = [
  { feature: "Open Source", hero: true, auth0: false },
  { feature: "Self-Hosted", hero: true, auth0: false },
  { feature: "In-Process (No Network Hop)", hero: true, auth0: false },
  { feature: "Organizations (Multi-Tenant)", hero: "Free", auth0: "Enterprise Plan" },
  { feature: "User Impersonation", hero: "Free", auth0: "Enterprise Plan" },
  { feature: "Custom Database Schemas", hero: true, auth0: false },
  { feature: "Auth0 API Compatibility", hero: true, auth0: "N/A" },
  { feature: "Edge Runtime Support", hero: true, auth0: false },
  { feature: "SSO / SAML", hero: true, auth0: "Enterprise Plan" },
  { feature: "Managed Hosting Option", hero: "Coming Soon", auth0: true },
];

const Cell = ({ value }: { value: boolean | string }) => {
  if (value === true) return <Check className="h-4 w-4 text-success mx-auto" strokeWidth={1.5} />;
  if (value === false) return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" strokeWidth={1.5} />;
  return <span className="text-sm text-muted-foreground">{value}</span>;
};

const VsAuth0 = () => (
  <main>
    <GridBackground>
      <section className="container py-28 md:py-36 text-center">
        <FadeIn>
          <h1 className="text-4xl md:text-5xl font-semibold mb-4">AuthHero vs Auth0</h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Stop paying the enterprise tax. Get every feature, for free.
          </p>
        </FadeIn>
      </section>
    </GridBackground>

    <section className="container pb-24">
      <FadeIn>
        <div className="hairline rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Feature</th>
                <th className="py-3 px-4 font-medium text-center">AuthHero</th>
                <th className="py-3 px-4 font-medium text-center text-muted-foreground">Auth0</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="py-3 px-4 font-medium">{row.feature}</td>
                  <td className="py-3 px-4 text-center"><Cell value={row.hero} /></td>
                  <td className="py-3 px-4 text-center"><Cell value={row.auth0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </section>
  </main>
);

export default VsAuth0;
