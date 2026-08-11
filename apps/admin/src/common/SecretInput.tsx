import { useState } from "react";
import { useWatch } from "react-hook-form";
import { TextInput, type TextInputProps } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export type SecretInputProps = TextInputProps & {
  /**
   * Source of the masked preview of the stored secret. Defaults to
   * `<source>_hint`, which is what the management API returns.
   */
  hintSource?: string;
};

/**
 * Password-style input for a write-only secret.
 *
 * The API never returns the stored secret, so the field starts empty. When it
 * returns a masked hint (e.g. `3a9f••••••••`) we show it as the placeholder,
 * so you can tell a secret is set — and which one — without revealing it.
 * Submitting the form with the field left blank keeps the stored value.
 */
export function SecretInput({ hintSource, ...props }: SecretInputProps) {
  const [visible, setVisible] = useState(false);
  const hint = useWatch({ name: hintSource ?? `${props.source}_hint` });
  const hasHint = typeof hint === "string" && hint.length > 0;

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <TextInput
          {...props}
          type={visible ? "text" : "password"}
          placeholder={hasHint ? hint : props.placeholder}
          helperText={
            props.helperText ??
            (hasHint ? "Leave blank to keep the current value" : undefined)
          }
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide secret" : "Show secret"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
