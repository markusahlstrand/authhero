import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./routes";
import "./index.css";

export const createRoot = ViteReactSSG(
  { routes, basename: import.meta.env.BASE_URL },
  ({ isClient }) => {
    if (!isClient) return;
    // After a redeploy, code-split chunks get new hashed filenames and the old
    // ones 404. An already-open tab that navigates to a route whose chunk
    // changed fails with "Failed to fetch dynamically imported module". Vite
    // fires `vite:preloadError` in that case, so reload once to pull fresh HTML
    // and the new chunk names. The timestamp guard avoids a reload loop if a
    // chunk is genuinely missing.
    window.addEventListener("vite:preloadError", () => {
      const key = "vite:preloadReloadedAt";
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    });
  },
);
