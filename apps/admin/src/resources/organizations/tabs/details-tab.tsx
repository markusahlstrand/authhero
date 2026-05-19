import { TextInput } from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DetailsTab() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextInput source="id" readOnly />
            <TextInput source="name" required />
            <TextInput source="display_name" />
          </div>
          <TextInput source="description" multiline />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent>
          <TextInput source="branding.logo_url" label="Logo URL" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextInput source="branding.colors.primary" label="Primary color" />
            <TextInput
              source="branding.colors.page_background"
              label="Page background color"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
