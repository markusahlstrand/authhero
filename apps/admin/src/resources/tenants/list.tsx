import { List, DataTable, TextInput } from "@/components/admin";
import { getBasePath } from "@/utils/runtimeConfig";

export function TenantsList() {
  const filters = [
    <TextInput key="q" source="q" placeholder="Search" label={false} />,
  ];

  return (
    <List
      resource="tenants"
      filters={filters}
      sort={{ field: "friendly_name", order: "ASC" }}
    >
      <DataTable
        rowClick={(_id, _resource, record) => {
          window.location.href = `${getBasePath()}/${String(record.id)}`;
          return false;
        }}
      >
        <DataTable.Col source="friendly_name" label="Name" />
        <DataTable.Col source="id" />
        <DataTable.Col source="audience" />
        <DataTable.Col source="support_url" label="Support URL" />
      </DataTable>
    </List>
  );
}
