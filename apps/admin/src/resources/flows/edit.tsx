import { Edit, SimpleForm, TextInput } from "@/components/admin";

const jsonInputProps = {
  multiline: true as const,
  inputClassName: "font-mono text-sm min-h-[240px]",
  format: (v: unknown) =>
    v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2),
  parse: (v: string) => {
    if (!v?.trim()) return [];
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  },
};

export function FlowEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="name" required />
        <TextInput source="actions" label="Actions (JSON)" {...jsonInputProps} />
      </SimpleForm>
    </Edit>
  );
}
