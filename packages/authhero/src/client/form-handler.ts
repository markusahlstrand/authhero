/** @jsxImportSource hono/jsx */
import { useEffect } from "hono/jsx";

/**
 * FormHandler - Client-side component that enhances forms with loading states
 *
 * This component adds progressive enhancement to authentication forms:
 * - Shows loading state when form is submitted
 * - Handles browser back/forward cache (bfcache) properly
 * - Uses addEventListener to chain with existing handlers
 */
export function FormHandler() {
  useEffect(() => {
    const forms = document.querySelectorAll<HTMLFormElement>("form");

    forms.forEach((form) => {
      const submitBtn = form.querySelector<HTMLButtonElement>(
        "button[type=submit]",
      );

      if (submitBtn) {
        // Use addEventListener to properly chain with any existing handlers
        const handleSubmit = () => {
          submitBtn.classList.add("is-loading");
          submitBtn.disabled = true;
        };

        form.addEventListener("submit", handleSubmit);

        // Remove loading class if the page is loaded from browser bfcache
        const handlePageShow = (event: PageTransitionEvent) => {
          if (event.persisted) {
            submitBtn.classList.remove("is-loading");
            submitBtn.disabled = false;
          }
        };

        window.addEventListener("pageshow", handlePageShow);

        // Cleanup function
        return () => {
          form.removeEventListener("submit", handleSubmit);
          window.removeEventListener("pageshow", handlePageShow);
        };
      }
    });
  }, []); // Empty dependency array - run once on mount

  // This component doesn't render anything visible
  return null;
}
