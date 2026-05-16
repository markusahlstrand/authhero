import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextInput } from "@/components/admin";

const jsonInputProps = {
  multiline: true as const,
  inputClassName: "font-mono text-sm min-h-[240px]",
  format: (v: unknown) =>
    v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2),
  parse: (v: string) => {
    if (!v?.trim()) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  },
};

export function FlowTab() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          <TextInput source="nodes" label="Nodes (JSON)" {...jsonInputProps} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start & ending</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput source="start" label="Start (JSON)" {...jsonInputProps} />
            <TextInput
              source="ending"
              label="Ending (JSON)"
              {...jsonInputProps}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <TextInput
            source="messages"
            label="Messages (JSON)"
            {...jsonInputProps}
          />
        </CardContent>
      </Card>
    </div>
  );
}
