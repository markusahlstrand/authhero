import { Edit, SimpleForm, TextInput, SelectInput } from "@/components/admin";

const jsonInputProps = {
  multiline: true as const,
  inputClassName: "font-mono text-sm min-h-[240px]",
  format: (v: unknown) =>
    v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2),
  parse: (v: string) => {
    if (!v?.trim()) return {};
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  },
};

export function PromptsEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm>
        <SelectInput
          source="universal_login_experience"
          label="Universal Login Experience"
          choices={[
            { id: "new", name: "New" },
            { id: "classic", name: "Classic" },
          ]}
        />
        <TextInput
          source="custom_text"
          label="Custom text (JSON)"
          {...jsonInputProps}
        />
      </SimpleForm>
    </Edit>
  );
}
