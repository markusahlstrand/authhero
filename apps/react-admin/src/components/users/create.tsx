import {
  Create,
  SimpleForm,
  TextInput,
  required,
  SelectInput,
  useGetList,
  FormDataConsumer,
} from "react-admin";
import { useState } from "react";

export function UserCreate() {
  const [_, setSelectedConnection] = useState(null);

  // Fetch available connections for the tenant
  const { data: connections, isLoading } = useGetList("connections", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  const transform = (data) => {
    // Set the provider based on the connection if available
    if (data.connection) {
      const connectionData = connections?.find(
        (c) => c.name === data.connection,
      );
      if (connectionData) {
        data.provider = connectionData.strategy || "database";
      }
    }
    return data;
  };

  return (
    <Create transform={transform}>
      <SimpleForm>
        <SelectInput
          source="connection"
          label="Connection Provider"
          choices={
            isLoading
              ? []
              : connections?.map((connection) => ({
                  id: connection.name,
                  name: connection.name,
                  // Store connection strategy for reference
                  _strategy: connection.strategy,
                }))
          }
          validate={[required()]}
          onChange={(e) => {
            const selectedConnectionData = connections?.find(
              (c) => c.name === e.target.value,
            );
            setSelectedConnection(selectedConnectionData);
          }}
        />

        <FormDataConsumer>
          {({ formData }) => {
            const connectionValue = formData.connection;
            const connectionData = connections?.find(
              (c) => c.name === connectionValue,
            );

            if (!connectionData) {
              // If no connection is selected yet, show both fields
              return (
                <>
                  <TextInput source="email" type="email" />
                  <TextInput source="phone_number" />
                </>
              );
            }

            // Show email input for email-based connections
            if (
              connectionData.strategy === "email" ||
              connectionData.strategy === "auth2" ||
              connectionData.name === "Username-Password-Authentication"
            ) {
              return (
                <TextInput
                  source="email"
                  type="email"
                  validate={[required()]}
                />
              );
            }

            // Show phone input for SMS-based connections
            if (connectionData.strategy === "sms") {
              return (
                <TextInput
                  source="phone_number"
                  validate={[required()]}
                  helperText="Enter the phone number with country code e.g., +1234567890"
                />
              );
            }

            // Default case - show both fields but make neither required
            return (
              <>
                <TextInput source="email" type="email" />
                <TextInput source="phone_number" />
              </>
            );
          }}
        </FormDataConsumer>

        <TextInput source="name" />
        <TextInput source="given_name" />
        <TextInput source="family_name" />
        <TextInput source="picture" />
      </SimpleForm>
    </Create>
  );
}
