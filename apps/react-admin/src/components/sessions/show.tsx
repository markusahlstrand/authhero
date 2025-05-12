import {
  Show,
  SimpleShowLayout,
  TextField,
  DateField,
  FunctionField,
  ArrayField,
  SingleFieldList,
  ChipField,
  Labeled,
  ReferenceField,
  TabbedShowLayout,
} from "react-admin";
import { Stack, Typography, Card, CardContent, Box } from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";

export function SessionShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <Stack spacing={2} direction="row" sx={{ mb: 2 }}>
          <Labeled label="Session ID">
            <TextField source="id" />
          </Labeled>
        </Stack>

        <TabbedShowLayout>
          <TabbedShowLayout.Tab label="Details">
            <Stack spacing={2} direction="row">
              <Labeled label="User ID">
                <ReferenceField reference="users" source="user_id" link="show">
                  <TextField source="email" />
                </ReferenceField>
              </Labeled>
            </Stack>

            <Stack spacing={2} direction="row">
              <Labeled label="Created At">
                <DateField source="created_at" showTime />
              </Labeled>
              <Labeled label="Last Used At">
                <DateField source="used_at" showTime emptyText="-" />
              </Labeled>
            </Stack>

            <Stack spacing={2} direction="row">
              <Labeled label="Expires At">
                <DateField source="expires_at" showTime emptyText="-" />
              </Labeled>
              <Labeled label="Idle Expires At">
                <DateField source="idle_expires_at" showTime emptyText="-" />
              </Labeled>
            </Stack>

            <Labeled label="Status">
              <FunctionField
                render={(record) => (record.revoked_at ? "Revoked" : "Active")}
              />
            </Labeled>

            <Typography variant="h6">Client Applications</Typography>
            <ArrayField source="clients">
              <SingleFieldList>
                <ChipField source="" />
              </SingleFieldList>
            </ArrayField>
          </TabbedShowLayout.Tab>

          <TabbedShowLayout.Tab label="Device">
            <Box sx={{ mt: 1 }}>
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Labeled label="Last IP Address">
                      <TextField source="device.last_ip" emptyText="-" />
                    </Labeled>
                    <Labeled label="Last User Agent">
                      <TextField
                        source="device.last_user_agent"
                        emptyText="-"
                      />
                    </Labeled>
                    <Labeled label="Initial IP Address">
                      <TextField source="device.initial_ip" emptyText="-" />
                    </Labeled>
                    <Labeled label="Initial User Agent">
                      <TextField
                        source="device.initial_user_agent"
                        emptyText="-"
                      />
                    </Labeled>
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </TabbedShowLayout.Tab>

          <TabbedShowLayout.Tab label="Raw">
            <Box sx={{ mt: 1 }}>
              <Card variant="outlined">
                <CardContent>
                  <FunctionField
                    render={(record) => <JsonOutput data={record} />}
                  />
                </CardContent>
              </Card>
            </Box>
          </TabbedShowLayout.Tab>
        </TabbedShowLayout>
      </SimpleShowLayout>
    </Show>
  );
}
