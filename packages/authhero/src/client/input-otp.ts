/** @jsxImportSource hono/jsx */

/**
 * Client-side handler for Input OTP fields
 *
 * This provides the interactive functionality for OTP input fields:
 * - Auto-advance to next input when a digit is entered
 * - Paste support for multi-digit codes
 * - Backspace navigation
 * - Arrow key navigation
 * - Form submission when all digits are filled
 */

export function InputOTPHandler() {
  // Find all OTP containers
  const containers = document.querySelectorAll("[data-input-otp-container]");

  containers.forEach((container) => {
    const inputs = Array.from(
      container.querySelectorAll("[data-input-otp-slot]"),
    ) as HTMLInputElement[];

    if (!inputs.length) return;

    // Find or create hidden input to store the complete code
    const form = container.closest("form");
    let hiddenInput: HTMLInputElement | null = null;

    if (form && inputs.length > 0) {
      const firstInput = inputs[0];
      const inputName = firstInput?.getAttribute("name");

      if (inputName) {
        // Check if hidden input already exists
        hiddenInput = form.querySelector(
          `input[name="${inputName}"][type="hidden"]`,
        ) as HTMLInputElement;

        if (!hiddenInput) {
          // Create hidden input to store the complete code
          hiddenInput = document.createElement("input");
          hiddenInput.type = "hidden";
          hiddenInput.name = inputName;
          form.appendChild(hiddenInput);
        }

        // Remove name from visible inputs so only hidden input is submitted
        inputs.forEach((input) => input.removeAttribute("name"));
      }
    }

    // Update hidden input with current value
    const updateHiddenInput = () => {
      if (hiddenInput) {
        const value = inputs.map((input) => input.value).join("");
        hiddenInput.value = value;

        // Auto-submit if all digits are filled
        if (value.length === inputs.length && form) {
          // Small delay to ensure the hidden input is updated
          setTimeout(() => {
            form.requestSubmit();
          }, 100);
        }
      }
    };

    inputs.forEach((input, index) => {
      // Handle input
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        let value = target.value;

        // Only allow numeric input
        value = value.replace(/[^0-9]/g, "");

        if (value.length > 1) {
          // If multiple digits pasted, take only the first
          value = value.charAt(0);
        }

        target.value = value;

        // Auto-advance to next input
        if (value && index < inputs.length - 1) {
          inputs[index + 1]?.focus();
        }

        updateHiddenInput();
      });

      // Handle paste
      input.addEventListener("paste", (e) => {
        e.preventDefault();

        const pastedData = e.clipboardData?.getData("text") || "";
        const digits = pastedData.replace(/[^0-9]/g, "");

        // Distribute digits across inputs
        for (
          let i = 0;
          i < Math.min(digits.length, inputs.length - index);
          i++
        ) {
          const targetInput = inputs[index + i];
          const digit = digits.charAt(i);
          if (targetInput && digit) {
            targetInput.value = digit;
          }
        }

        // Focus the next empty input or the last one
        const nextEmptyIndex = inputs.findIndex(
          (inp, idx) => idx >= index && !inp.value,
        );
        if (nextEmptyIndex !== -1) {
          inputs[nextEmptyIndex]?.focus();
        } else {
          inputs[Math.min(index + digits.length, inputs.length - 1)]?.focus();
        }

        updateHiddenInput();
      });

      // Handle backspace
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          const target = e.target as HTMLInputElement;

          if (!target.value && index > 0) {
            // If empty, move to previous input and clear it
            e.preventDefault();
            const prevInput = inputs[index - 1];
            if (prevInput) {
              prevInput.value = "";
              prevInput.focus();
            }
            updateHiddenInput();
          } else if (target.value) {
            // Clear current input (default behavior)
            setTimeout(() => updateHiddenInput(), 0);
          }
        } else if (e.key === "ArrowLeft" && index > 0) {
          e.preventDefault();
          inputs[index - 1]?.focus();
        } else if (e.key === "ArrowRight" && index < inputs.length - 1) {
          e.preventDefault();
          inputs[index + 1]?.focus();
        }
      });

      // Handle focus - select all text
      input.addEventListener("focus", () => {
        input.select();
      });
    });

    // Initialize hidden input with current values
    updateHiddenInput();
  });

  return null;
}
