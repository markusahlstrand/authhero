import {
  Datagrid,
  DeleteButton,
  ListBase,
  ListToolbar,
  Pagination,
  ResourceContextProvider,
  TextField,
  TextInput,
  TopToolbar,
  useListContext,
} from "react-admin";
import { Link } from "react-router-dom";
import { Box, Button, Card } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

const scopeFilters = [
  <TextInput key="search" label="Search" source="q" alwaysOn />,
];

function ScopesPanelActions({ rsId }: { rsId: string }) {
  return (
    <TopToolbar>
      <Button
        component={Link}
        to={`/resource-servers/${rsId}/scopes/create`}
        startIcon={<AddIcon />}
        size="small"
      >
        Add scope
      </Button>
    </TopToolbar>
  );
}

function ScopesPanelBody({
  rsId,
  readOnly,
}: {
  rsId: string;
  readOnly: boolean;
}) {
  const editPath = (record: { value: string }) =>
    `/resource-servers/${rsId}/scopes/${encodeURIComponent(record.value)}`;

  return (
    <Card>
      <ListToolbar
        filters={scopeFilters}
        actions={readOnly ? <TopToolbar /> : <ScopesPanelActions rsId={rsId} />}
      />
      <Datagrid
        rowClick={(_id, _r, record) => editPath(record as any)}
        bulkActionButtons={readOnly ? false : undefined}
      >
        <TextField source="value" label="Scope" />
        <TextField source="description" />
        {!readOnly && (
          <DeleteButton mutationMode="pessimistic" redirect={false} />
        )}
      </Datagrid>
      <ScopesPanelPagination />
    </Card>
  );
}

function ScopesPanelPagination() {
  const { total } = useListContext();
  if (!total) return null;
  return <Pagination rowsPerPageOptions={[10, 25, 50, 100]} />;
}

export function ScopesPanel({
  rsId,
  readOnly = false,
}: {
  rsId: string;
  readOnly?: boolean;
}) {
  return (
    <Box sx={{ width: "100%" }}>
      <ResourceContextProvider value="resource-server-scopes">
        <ListBase
          filter={{ resource_server_id: rsId }}
          perPage={25}
          sort={{ field: "value", order: "ASC" }}
          disableSyncWithLocation
        >
          <ScopesPanelBody rsId={rsId} readOnly={readOnly} />
        </ListBase>
      </ResourceContextProvider>
    </Box>
  );
}
