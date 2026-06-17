import { Outlet } from "react-router-dom";
import { Head } from "vite-react-ssg";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const queryClient = new QueryClient();

const SITE_TITLE = "AuthHero — Open Source Auth for the Self-Hosted Era";
const SITE_DESCRIPTION =
  "Identity infrastructure you own. Auth0-compatible, Node-native, runs in-process. Open source under MIT.";

const Layout = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* Site-wide SEO defaults. Pages override title/description via their own
          <Head>; react-helmet-async dedupes by tag, so the innermost wins. */}
      <Head>
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:image" content="/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@authhero" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:image" content="/og-image.png" />
      </Head>
      <Toaster />
      <Sonner />
      <Navbar />
      <Outlet />
      <Footer />
    </TooltipProvider>
  </QueryClientProvider>
);

export default Layout;
