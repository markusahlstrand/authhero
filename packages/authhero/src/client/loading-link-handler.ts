/** @jsxImportSource hono/jsx */
import { useEffect } from "hono/jsx";

/**
 * LoadingLinkHandler - Client-side enhancement for anchor-based action buttons
 *
 * Social login buttons (Google, Facebook, ...) render as plain <a> links that
 * navigate to /authorize. Because they are not form submissions, the FormHandler
 * never sees them, so without this handler the button stays clickable and the
 * user can fire several authorize requests by clicking repeatedly.
 *
 * On the first plain left-click we add the shared `is-loading` class. The
 * `.btn.is-loading` style sets `pointer-events: none` (and shows a spinner),
 * which both gives feedback and blocks any further clicks while the browser
 * navigates away.
 */
export function LoadingLinkHandler() {
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(
      "a[data-loading-link]",
    );
    const cleanupFunctions: Array<() => void> = [];

    links.forEach((link) => {
      const handleClick = (event: MouseEvent) => {
        // Ignore anything that doesn't navigate this tab away: already
        // prevented, non-primary buttons, or modifier-clicks (open in new tab).
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        link.classList.add("is-loading");
      };

      link.addEventListener("click", handleClick);

      // Re-enable the link if the page is restored from the browser bfcache
      // (e.g. the user navigates back), otherwise it would stay disabled.
      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          link.classList.remove("is-loading");
        }
      };

      window.addEventListener("pageshow", handlePageShow);

      cleanupFunctions.push(() => {
        link.removeEventListener("click", handleClick);
        window.removeEventListener("pageshow", handlePageShow);
      });
    });

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, []); // Empty dependency array - run once on mount

  // This component doesn't render anything visible
  return null;
}
