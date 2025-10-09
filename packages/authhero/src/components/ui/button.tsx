import type { FC } from "hono/jsx";
import { PropsWithChildren } from "hono/jsx";
import cn from "classnames";

export interface ButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  style?: Record<string, string | number>;
  onmouseover?: string;
  onmouseout?: string;
}

const Button: FC<PropsWithChildren<ButtonProps>> = ({
  children,
  className,
  variant = "default",
  size = "default",
  type = "button",
  disabled = false,
  style,
  onmouseover,
  onmouseout,
}) => {
  const variantStyles = {
    default:
      "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800",
    outline:
      "border border-gray-300 bg-transparent hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800",
    ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
  };

  const sizeStyles = {
    default: "h-10 px-4 py-2",
    sm: "h-9 px-3 text-sm",
    lg: "h-11 px-8",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      style={style}
      onmouseover={onmouseover}
      onmouseout={onmouseout}
    >
      {children}
    </button>
  );
};

export default Button;
