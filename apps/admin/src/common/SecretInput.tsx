import { useState } from "react";
import { TextInput, type TextInputProps } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export function SecretInput(props: TextInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <TextInput {...props} type={visible ? "text" : "password"} />
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
