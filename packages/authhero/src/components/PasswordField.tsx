import type { FC } from "hono/jsx";
import i18next from "i18next";
import Input from "./ui/input";

type Props = {
  id: string;
  name: string;
  placeholder: string;
  error?: boolean;
  style?: Record<string, string | number>;
};

/**
 * A themed password input with a client-side show/hide toggle.
 *
 * Emits the `data-password-toggle` / `data-password-input` /
 * `data-password-toggle-btn` / `data-show-icon` / `data-hide-icon` hooks that
 * the client-side `PasswordToggle` component wires up. Shared by the
 * enter-password, reset-password, and sign-up screens.
 */
const PasswordField: FC<Props> = ({ id, name, placeholder, error, style }) => {
  return (
    <div className="relative" data-password-toggle>
      <Input
        id={id}
        name={name}
        type="password"
        data-password-input={name}
        placeholder={placeholder}
        required
        error={error}
        className="border pr-8"
        style={style}
      />
      <button
        type="button"
        data-password-toggle-btn
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label={i18next.t(
          "toggle_password_visibility",
          "Toggle password visibility",
        )}
      >
        {/* Eye icon (show password) */}
        <svg
          data-show-icon
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {/* Eye-off icon (hide password) - hidden by default */}
        <svg
          data-hide-icon
          className="hidden"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      </button>
    </div>
  );
};

export default PasswordField;
