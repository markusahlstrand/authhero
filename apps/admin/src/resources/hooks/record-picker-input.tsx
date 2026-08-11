import { required, useGetList } from "ra-core";
import { AutocompleteInput } from "@/components/admin";

interface RecordPickerInputProps {
  source: string;
  label: string;
  /** Resource whose records populate the dropdown (e.g. "forms", "actions"). */
  reference: string;
  isRequired?: boolean;
}

interface PickerRecord {
  id?: string;
  name?: string;
}

/**
 * Searchable dropdown for fields that store the id of another resource's
 * record (form_id → forms, code_id → actions). Loads choices via getList and
 * filters client-side, avoiding the reference-input machinery which relies on
 * dataProvider.getMany (not implemented for these resources).
 */
export function RecordPickerInput({
  source,
  label,
  reference,
  isRequired,
}: RecordPickerInputProps) {
  const { data, isPending } = useGetList(reference, {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  return (
    <AutocompleteInput
      source={source}
      label={label}
      choices={data ?? []}
      isPending={isPending}
      optionText={(record: PickerRecord) => record.name || record.id || ""}
      translateChoice={false}
      validate={isRequired ? required() : undefined}
    />
  );
}
