import {
  CircleDot,
  MailCheck,
  Hash,
  Phone,
  Globe,
  Lock,
  ListChecks,
  ListTree,
  Calendar,
  FileCheck,
  Code2,
  Text,
  Sparkles,
} from "lucide-react";
import type { FormNodeComponent } from "../types";

const truncate = (text: string, max = 60) => {
  const clean = text.replace(/<[^>]*>/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

const ICONS: Record<string, typeof Text> = {
  TEXT: Text,
  EMAIL: MailCheck,
  NUMBER: Hash,
  TEL: Phone,
  URL: Globe,
  PASSWORD: Lock,
  DROPDOWN: ListTree,
  CHOICE: ListChecks,
  DATE: Calendar,
  CUSTOM: Code2,
  LEGAL: FileCheck,
  RICH_TEXT: Sparkles,
  NEXT_BUTTON: CircleDot,
};

export function ComponentPreview({
  component,
}: {
  component: FormNodeComponent;
}) {
  if (component.type === "RICH_TEXT") {
    const content = component.config?.content;
    return (
      <div className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-foreground/80 [&_a]:text-primary [&_a]:underline">
        {content ? truncate(content) : "Rich text content"}
      </div>
    );
  }

  if (component.type === "NEXT_BUTTON") {
    return (
      <div className="rounded-md bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground shadow-sm">
        {component.config?.text || "Continue"}
      </div>
    );
  }

  if (component.type === "LEGAL") {
    return (
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <FileCheck className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          {component.config?.text
            ? truncate(component.config.text, 70)
            : "Legal"}
        </span>
      </div>
    );
  }

  const Icon = ICONS[component.type] ?? CircleDot;
  const label = (() => {
    if (
      "label" in component &&
      typeof component.label === "string" &&
      component.label
    ) {
      return component.label;
    }
    const config = component.config as
      | { placeholder?: string; label?: string }
      | undefined;
    return config?.label || config?.placeholder || component.type;
  })();

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate text-xs">{label}</span>
    </div>
  );
}
