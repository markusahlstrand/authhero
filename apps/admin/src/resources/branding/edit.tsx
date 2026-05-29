import { useWatch } from "react-hook-form";
import { Edit, SelectInput, SimpleForm, TextInput } from "@/components/admin";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import { ColorInput } from "./color-input";
import { ThemesTab } from "./themes-tab";
import { UniversalLoginTab } from "./universal-login-tab";
import { BrandingPreview } from "./preview";

const keepEmptyString = (v: string | null | undefined) => v ?? "";

function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      const cleaned = cleanObject(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function transformBranding(data: Record<string, unknown>) {
  const result = cleanObject(data);
  if (
    result.font &&
    typeof result.font === "object" &&
    !(result.font as Record<string, unknown>).url
  ) {
    delete result.font;
  }
  return result;
}

function PageBackgroundFields() {
  const type = useWatch({ name: "colors.page_background.type" }) as
    | string
    | undefined;
  const isGradient = type === "linear-gradient" || type === "gradient";

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="text-sm font-medium">Page Background</div>
      <SelectInput
        source="colors.page_background.type"
        label="Type"
        choices={[
          { id: "solid", name: "Solid" },
          { id: "linear-gradient", name: "Gradient" },
        ]}
      />
      <ColorInput
        source="colors.page_background.start"
        label={isGradient ? "Start color" : "Color"}
      />
      {isGradient && (
        <>
          <ColorInput source="colors.page_background.end" label="End color" />
          <TextInput
            source="colors.page_background.angle_deg"
            label="Gradient angle (deg)"
            type="number"
          />
        </>
      )}
    </div>
  );
}

function StyleTab() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <ColorInput source="colors.primary" label="Primary color" />
      <PageBackgroundFields />
      <TextInput
        source="favicon_url"
        label="Favicon URL"
        parse={keepEmptyString}
      />
      <TextInput source="logo_url" label="Logo URL" parse={keepEmptyString} />
      <TextInput source="font.url" label="Font URL" parse={keepEmptyString} />
      <SelectInput
        source="dark_mode"
        label="Dark mode"
        helperText="Default color scheme for the universal login page. The per-user ah-dark-mode cookie still overrides this at runtime."
        choices={[
          { id: "auto", name: "Auto (follow system)" },
          { id: "light", name: "Light" },
          { id: "dark", name: "Dark" },
        ]}
      />
    </div>
  );
}

function BrandingFormContent() {
  return (
    <div className="flex w-full gap-6">
      <div className="min-w-0 flex-1">
        <UrlTabs defaultValue="style">
          <TabsList>
            <TabsTrigger value="style">Style</TabsTrigger>
            <TabsTrigger value="themes">Themes</TabsTrigger>
            <TabsTrigger value="universal-login">Universal Login</TabsTrigger>
          </TabsList>
          <TabsContent value="style" className="mt-4">
            <StyleTab />
          </TabsContent>
          <TabsContent value="themes" className="mt-4">
            <ThemesTab />
          </TabsContent>
          <TabsContent value="universal-login" className="mt-4">
            <UniversalLoginTab />
          </TabsContent>
        </UrlTabs>
      </div>
      <aside className="hidden w-[380px] shrink-0 lg:block">
        <div className="sticky top-4 h-[calc(100vh-6rem)]">
          <BrandingPreview />
        </div>
      </aside>
    </div>
  );
}

export function BrandingEdit() {
  return (
    <Edit
      mutationMode="pessimistic"
      redirect={false}
      title="Branding"
      transform={transformBranding}
    >
      <SimpleForm className="max-w-none">
        <BrandingFormContent />
      </SimpleForm>
    </Edit>
  );
}
