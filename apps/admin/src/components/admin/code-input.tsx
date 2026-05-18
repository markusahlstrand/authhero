import { useEffect, useState } from "react";
import type { InputProps } from "ra-core";
import { useInput, useResourceContext, FieldTitle } from "ra-core";
import Editor from "@monaco-editor/react";
import {
  FormControl,
  FormError,
  FormField,
  FormLabel,
} from "@/components/admin/form";
import { InputHelperText } from "@/components/admin/input-helper-text";
import { useTheme } from "@/components/admin/use-theme";

export type CodeInputProps = InputProps & {
  language?: string;
  height?: number | string;
  readOnly?: boolean;
  className?: string;
};

function resolveMonacoTheme(themeMode: string | undefined): "vs" | "vs-dark" {
  if (themeMode === "dark") return "vs-dark";
  if (themeMode === "light") return "vs";
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "vs-dark";
  }
  return "vs";
}

export const CodeInput = (props: CodeInputProps) => {
  const resource = useResourceContext(props);
  const { label, source, helperText, language = "javascript", height = 420, readOnly, className } = props;
  const { id, field, isRequired } = useInput(props);
  const { theme } = useTheme();
  const [monacoTheme, setMonacoTheme] = useState<"vs" | "vs-dark">(() =>
    resolveMonacoTheme(theme),
  );

  useEffect(() => {
    if (theme === "system" || theme === undefined) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const update = () => setMonacoTheme(media.matches ? "vs-dark" : "vs");
      update();
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    setMonacoTheme(resolveMonacoTheme(theme));
  }, [theme]);

  return (
    <FormField id={id} className={className} name={field.name}>
      {label !== false && (
        <FormLabel>
          <FieldTitle
            label={label}
            source={source}
            resource={resource}
            isRequired={isRequired}
          />
        </FormLabel>
      )}
      <FormControl>
        <div className="overflow-hidden rounded-md border">
          <Editor
            height={height}
            language={language}
            theme={monacoTheme}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(value) => field.onChange(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              readOnly,
            }}
          />
        </div>
      </FormControl>
      <InputHelperText helperText={helperText} />
      <FormError />
    </FormField>
  );
};
