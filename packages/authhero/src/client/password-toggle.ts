/** @jsxImportSource hono/jsx */
import { useEffect } from "hono/jsx";

/**
 * PasswordToggle - Client-side component that adds show/hide password functionality
 *
 * This component enhances password inputs with visibility toggle buttons:
 * - Finds all password input wrappers with data-password-toggle attribute
 * - Adds click handlers to toggle buttons
 * - Toggles password field type between "password" and "text"
 * - Updates button visibility accordingly
 */
export function PasswordToggle() {
  useEffect(() => {
    // Find all password input containers
    const passwordContainers = document.querySelectorAll<HTMLElement>(
      "[data-password-toggle]",
    );

    const cleanupFunctions: Array<() => void> = [];

    passwordContainers.forEach((container) => {
      const passwordInput = container.querySelector<HTMLInputElement>(
        "input[type='password'], input[data-password-input]",
      );
      const toggleButton = container.querySelector<HTMLButtonElement>(
        "[data-password-toggle-btn]",
      );
      const showIcon =
        toggleButton?.querySelector<HTMLElement>("[data-show-icon]");
      const hideIcon =
        toggleButton?.querySelector<HTMLElement>("[data-hide-icon]");

      if (!passwordInput || !toggleButton || !showIcon || !hideIcon) {
        return;
      }

      const updateVisibility = (show: boolean) => {
        if (show) {
          passwordInput.type = "text";
          passwordInput.setAttribute("data-password-input", "text");
          showIcon.classList.add("hidden");
          hideIcon.classList.remove("hidden");
        } else {
          passwordInput.type = "password";
          passwordInput.setAttribute("data-password-input", "password");
          hideIcon.classList.add("hidden");
          showIcon.classList.remove("hidden");
        }
      };

      const handleToggle = (e: Event) => {
        e.preventDefault();
        const isPassword = passwordInput.type === "password";
        updateVisibility(isPassword);
      };

      toggleButton.addEventListener("click", handleToggle);

      // Collect cleanup function
      cleanupFunctions.push(() => {
        toggleButton.removeEventListener("click", handleToggle);
      });
    });

    // Return cleanup function for useEffect
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
