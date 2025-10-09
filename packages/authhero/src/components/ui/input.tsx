import type { FC } from "hono/jsx";
import cn from "classnames";

export interface InputProps {
  id?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  value?: string;
  disabled?: boolean;
  error?: boolean;
  style?: Record<string, string | number>;
}

const Input: FC<InputProps> = ({
  id,
  type = "text",
  name,
  placeholder,
  className,
  required = false,
  value,
  disabled = false,
  error = false,
  style,
}) => {
  return (
    <input
      id={id}
      type={type}
      name={name}
      placeholder={placeholder}
      required={required}
      value={value}
      disabled={disabled}
      className={cn(
        "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:ring-offset-gray-900 dark:placeholder:text-gray-400",
        error && "border-red-500 focus-visible:ring-red-500",
        className,
      )}
      style={style}
    />
  );
};

export default Input;
