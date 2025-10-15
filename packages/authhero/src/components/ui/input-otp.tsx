import type { FC } from "hono/jsx";
import cn from "classnames";

export interface InputOTPProps {
  maxLength: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  pattern?: RegExp;
  name?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export interface InputOTPGroupProps {
  children: any;
  className?: string;
}

export interface InputOTPSlotProps {
  index: number;
  className?: string;
  style?: Record<string, string | number>;
}

const InputOTP: FC<InputOTPProps> = ({
  maxLength,
  value = "",
  disabled = false,
  className,
  containerClassName,
  name,
  id,
  required,
  autoFocus,
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      data-input-otp-container=""
    >
      {Array.from({ length: maxLength }).map((_, index) => (
        <input
          key={index}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ""}
          disabled={disabled}
          name={index === 0 ? name : undefined}
          id={index === 0 ? id : undefined}
          required={index === 0 ? required : undefined}
          autoFocus={index === 0 ? autoFocus : undefined}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md text-center font-mono",
            "focus:z-10 focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          data-input-otp-slot={index}
        />
      ))}
    </div>
  );
};

const InputOTPGroup: FC<InputOTPGroupProps> = ({ children, className }) => {
  return (
    <div className={cn("flex items-center", className)} data-input-otp-group="">
      {children}
    </div>
  );
};

const InputOTPSlot: FC<InputOTPSlotProps> = () => {
  // This is a placeholder component for the shadcn pattern
  // The actual slots are rendered by InputOTP itself
  return null;
};

const InputOTPSeparator: FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="separator"
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="4" cy="4" r="1" fill="currentColor" />
      </svg>
    </div>
  );
};

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
