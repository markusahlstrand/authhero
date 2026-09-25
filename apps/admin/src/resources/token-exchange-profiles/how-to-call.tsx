import { useRecordContext } from "ra-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HowToCall() {
  const record = useRecordContext<{ subject_token_type?: string }>();
  const subjectTokenType =
    record?.subject_token_type || "urn:acme:session-token";

  const snippet = `curl -X POST https://YOUR_AUTH_DOMAIN/oauth/token \\
  -H "content-type: application/x-www-form-urlencoded" \\
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \\
  -d client_id=YOUR_CLIENT_ID \\
  -d client_secret=YOUR_CLIENT_SECRET \\
  -d subject_token=THE_SIGNED_JWT \\
  -d subject_token_type=${subjectTokenType} \\
  -d audience=https://api.example.com \\
  -d "scope=openid profile email"`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>How to call it</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Your backend posts the subject token to the token endpoint. The
          application must have Custom Token Exchange enabled on its Advanced
          tab. The response holds tokens only; no login session is created.
        </p>
        <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto">
          {snippet}
        </pre>
      </CardContent>
    </Card>
  );
}
