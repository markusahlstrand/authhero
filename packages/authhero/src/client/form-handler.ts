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
    const cleanupFunctions: Array<() => void> = [];

    forms.forEach((form) => {
      // Use addEventListener to properly chain with any existing handlers
      const handleSubmit = (event: SubmitEvent) => {
        // Bail if the submission was already prevented
        if (event.defaultPrevented) {
          return;
        }

        // Get the actual button that was clicked (submitter)
        const submitBtn = event.submitter as HTMLButtonElement | null;

        if (submitBtn && submitBtn.type === "submit") {
          submitBtn.classList.add("is-loading");
          submitBtn.disabled = true;
        }
      };

      form.addEventListener("submit", handleSubmit);

      // Remove loading class if the page is loaded from browser bfcache
      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          // Re-enable all submit buttons in this form
          const submitButtons = form.querySelectorAll<HTMLButtonElement>(
            "button[type=submit]",
          );
          submitButtons.forEach((btn) => {
            btn.classList.remove("is-loading");
            btn.disabled = false;
          });
        }
      };

      window.addEventListener("pageshow", handlePageShow);

      // Store cleanup function for this form
      cleanupFunctions.push(() => {
        form.removeEventListener("submit", handleSubmit);
        window.removeEventListener("pageshow", handlePageShow);
      });
    });

    // Cleanup function - runs when component unmounts
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, []); // Empty dependency array - run once on mount

  // This component doesn't render anything visible
  return null;
}
