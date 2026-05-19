import {
  ArrayInput,
  CodeInput,
  Create,
  SimpleForm,
  SimpleFormIterator,
  TextInput,
} from "@/components/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const defaultCode = `exports.onExecutePostLogin = async (event, api) => {
  // Add your custom logic here
};
`;

interface ActionPayload {
  supported_triggers?: Array<{ id: string }>;
  secrets?: Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
}

export function ActionCreate() {
  return (
    <Create
      transform={(data: ActionPayload) => ({
        ...data,
        supported_triggers: data.supported_triggers ?? [{ id: "post-login" }],
        secrets: data.secrets?.filter((s) => s?.name),
      })}
    >
      <SimpleForm className="max-w-none">
        <div className="flex flex-col gap-6 w-full">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TextInput source="name" required />
              <TextInput source="runtime" defaultValue="webworker" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Code</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeInput
                source="code"
                language="javascript"
                height={420}
                defaultValue={defaultCode}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secrets</CardTitle>
            </CardHeader>
            <CardContent>
              <ArrayInput source="secrets" label={false}>
                <SimpleFormIterator inline>
                  <TextInput source="name" label="Name" />
                  <TextInput source="value" label="Value" type="password" />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <ArrayInput source="dependencies" label={false}>
                <SimpleFormIterator inline>
                  <TextInput source="name" label="Package" />
                  <TextInput source="version" label="Version" />
                </SimpleFormIterator>
              </ArrayInput>
            </CardContent>
          </Card>
        </div>
      </SimpleForm>
    </Create>
  );
}
