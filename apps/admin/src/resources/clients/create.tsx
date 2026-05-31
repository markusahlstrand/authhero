import { useState } from "react";
import { Globe, Monitor, Server, Smartphone } from "lucide-react";
import { Create, SimpleForm, TextInput } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AppType = "spa" | "native" | "regular_web" | "non_interactive";

const APP_TYPES: Array<{
  id: AppType;
  label: string;
  description: string;
  icon: typeof Globe;
}> = [
  {
    id: "regular_web",
    label: "Regular Web App",
    description: "Server-rendered app with a backend that can hold a secret.",
    icon: Globe,
  },
  {
    id: "spa",
    label: "Single Page App",
    description: "Browser-only app (React, Vue, etc.). PKCE, no client secret.",
    icon: Monitor,
  },
  {
    id: "native",
    label: "Native App",
    description: "Mobile or desktop app. PKCE, no client secret.",
    icon: Smartphone,
  },
  {
    id: "non_interactive",
    label: "Machine to Machine",
    description:
      "Backend service or CLI. Client credentials grant — no user redirects.",
    icon: Server,
  },
];

export function ClientCreate() {
  const [appType, setAppType] = useState<AppType | null>(null);

  if (!appType) {
    return (
      <Create>
        <div className="flex flex-col gap-4 p-4 max-w-3xl">
          <div>
            <h2 className="text-lg font-medium">Choose application type</h2>
            <p className="text-sm text-muted-foreground">
              Picks sensible defaults for grant types and auth method. You can
              change individual fields later.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {APP_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAppType(t.id)}
                  className={cn(
                    "text-left rounded-lg border p-4 hover:border-primary hover:bg-accent transition-colors",
                    "flex flex-col gap-2",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{t.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </Create>
    );
  }

  const isM2M = appType === "non_interactive";

  return (
    <Create>
      <SimpleForm defaultValues={{ app_type: appType }}>
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <Label className="text-xs text-muted-foreground">
              Application type
            </Label>
            <div className="text-sm font-medium">
              {APP_TYPES.find((t) => t.id === appType)?.label}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAppType(null)}
          >
            Change
          </Button>
        </div>
        <TextInput source="name" required />
        {!isM2M && (
          <TextInput
            source="callbacks"
            label="Callback URL (optional)"
            helperText="Where the auth server redirects after login. You can add more later."
            parse={(v: string) => (v ? [v] : [])}
            format={(v: string[] | undefined) => (v && v[0]) || ""}
          />
        )}
      </SimpleForm>
    </Create>
  );
}
