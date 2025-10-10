import type { FC } from "hono/jsx";
import { useState, useRef, useEffect } from "hono/jsx";
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
  onChange,
  onComplete,
  disabled = false,
  className,
  containerClassName,
  pattern,
  name,
  id,
  required,
  autoFocus,
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [focusedIndex, setFocusedIndex] = useState(autoFocus ? 0 : -1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Update internal value when prop value changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleInputChange = (index: number, inputValue: string) => {
    // Only allow single characters and apply pattern if provided
    const char = inputValue.slice(-1);
    if (pattern && !pattern.test(char)) {
      return;
    }

    const newValue = internalValue.split("");
    newValue[index] = char;
    const updatedValue = newValue.join("").slice(0, maxLength);

    setInternalValue(updatedValue);
    onChange?.(updatedValue);

    // Auto-focus next input
    if (char && index < maxLength - 1 && inputRefs.current) {
      setFocusedIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }

    // Call onComplete when all slots are filled
    if (updatedValue.length === maxLength) {
      onComplete?.(updatedValue);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === "Backspace") {
      const newValue = internalValue.split("");
      if (newValue[index]) {
        newValue[index] = "";
      } else if (index > 0) {
        newValue[index - 1] = "";
        setFocusedIndex(index - 1);
        if (inputRefs.current) {
          inputRefs.current[index - 1]?.focus();
        }
      }
      const updatedValue = newValue.join("");
      setInternalValue(updatedValue);
      onChange?.(updatedValue);
    } else if (e.key === "ArrowLeft" && index > 0) {
      setFocusedIndex(index - 1);
      if (inputRefs.current) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowRight" && index < maxLength - 1) {
      setFocusedIndex(index + 1);
      if (inputRefs.current) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData?.getData("text") || "";
    let filteredData = pasteData;

    if (pattern) {
      filteredData = pasteData
        .split("")
        .filter((char) => pattern.test(char))
        .join("");
    }

    const newValue = filteredData.slice(0, maxLength);
    setInternalValue(newValue);
    onChange?.(newValue);

    // Focus the next empty slot or the last slot
    const nextIndex = Math.min(newValue.length, maxLength - 1);
    setFocusedIndex(nextIndex);
    if (inputRefs.current) {
      inputRefs.current[nextIndex]?.focus();
    }

    if (newValue.length === maxLength) {
      onComplete?.(newValue);
    }
  };

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
          ref={(el) => {
            if (inputRefs.current) {
              inputRefs.current[index] = el;
            }
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={internalValue[index] || ""}
          onChange={(e) => {
            const target = e.target as HTMLInputElement;
            handleInputChange(index, target.value);
          }}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          onFocus={() => setFocusedIndex(index)}
          onBlur={() => setFocusedIndex(-1)}
          disabled={disabled}
          name={index === 0 ? name : undefined}
          id={index === 0 ? id : undefined}
          required={index === 0 ? required : undefined}
          autoFocus={index === 0 ? autoFocus : undefined}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md text-center font-mono",
            focusedIndex === index && "z-10 ring-1 ring-ring",
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
