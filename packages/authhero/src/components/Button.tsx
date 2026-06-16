import cn from "classnames";
import Spinner from "./Spinner";
import { PropsWithChildren } from "hono/jsx";

// in React we would do
// interface Props extends ButtonHTMLAttributes<HTMLButtonElement>
// to get all the DOM attributes of a button
type Props = {
  className?: string;
  Component?: string;
  variant?: "primary" | "secondary" | "custom";
  // in Nextjs & React we use default DOM element types...
  href?: string;
  disabled?: boolean;
  isLoading?: boolean;
  id?: string;
  // When the button renders as an anchor, mark it so the client-side
  // LoadingLinkHandler shows a loading state and blocks repeated clicks.
  loadingLink?: boolean;
};

const Button = ({
  children,
  className,
  Component = "button",
  variant = "primary",
  href,
  disabled,
  isLoading,
  id,
  loadingLink,
}: PropsWithChildren<Props>) => {
  const hrefProps =
    Component === "a"
      ? { href, ...(loadingLink ? { "data-loading-link": "" } : {}) }
      : {};
  return (
    // @ts-expect-error - refactor this when migrating to authhero
    <Component
      class={cn(
        "btn relative w-full rounded-lg text-center",
        {
          "px-4 py-5": variant !== "custom",
          "bg-primary text-textOnPrimary hover:bg-primaryHover":
            variant === "primary",
          "border border-gray-300 bg-white text-black": variant === "secondary",
          "pointer-events-none cursor-not-allowed opacity-40": disabled,
          "is-loading": isLoading,
        },
        "focus:outline-none focus:ring",
        className,
      )}
      type="submit"
      disabled={disabled}
      id={id}
      {...hrefProps}
    >
      <span className="btn-label flex items-center justify-center space-x-2">
        {children}
      </span>
      <div className="btn-spinner absolute left-0 top-0 flex h-full w-full items-center justify-center">
        <Spinner size="medium" />
      </div>
    </Component>
  );
};

export default Button;
