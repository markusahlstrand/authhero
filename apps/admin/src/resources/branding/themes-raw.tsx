import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/admin/use-theme";

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

function stringifyThemes(value: unknown): string {
  if (value === undefined || value === null) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

/**
 * Raw JSON view of the `themes` object. Lets you copy the whole theme and edit
 * it as JSON. Writes back into the shared form state, so the structured Themes
 * tab and the live preview stay in sync.
 */
export function ThemesRawEditor() {
  const { setValue } = useFormContext();
  const themes = useWatch({ name: "themes" });
  const { theme } = useTheme();

  // Seed the editor once from form state; the editor is the source of truth
  // while this view is mounted.
  const [text, setText] = useState(() => stringifyThemes(themes));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleChange = (value: string | undefined) => {
    const next = value ?? "";
    setText(next);
    setCopied(false);
    if (next.trim() === "") {
      setValue("themes", {}, { shouldDirty: true });
      setError(null);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(next);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setError("Themes must be a JSON object");
        return;
      }
      setValue("themes", parsed, { shouldDirty: true });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Edit the full theme as JSON. Changes sync with the form fields and
          preview; invalid JSON is not applied until fixed.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Editor
          height={520}
          language="json"
          theme={monacoTheme}
          value={text}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
