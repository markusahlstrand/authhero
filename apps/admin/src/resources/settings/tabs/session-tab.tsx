import { NumberInput, SelectInput } from "@/components/admin";

export function SessionTab() {
  return (
    <div className="flex flex-col gap-3">
      <NumberInput
        source="idle_session_lifetime"
        label="Idle Session Lifetime (hours)"
        helperText="Time in hours before an inactive session expires. The user must log in again after being idle for this long. Default: 72 (3 days)"
      />
      <NumberInput
        source="session_lifetime"
        label="Session Lifetime (hours)"
        helperText="Maximum total session duration in hours, regardless of activity. After this time the user must log in again. Default: 168 (7 days)"
      />
      <SelectInput
        source="session_cookie.mode"
        label="Session Cookie Mode"
        choices={[
          { id: "persistent", name: "Persistent" },
          { id: "non-persistent", name: "Non-persistent" },
        ]}
        helperText="persistent or non-persistent"
      />
    </div>
  );
}
