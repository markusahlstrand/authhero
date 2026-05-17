import { AttackProtectionEdit } from "./edit";

// Singleton resource — render the edit form at the list URL
// so the path stays /attack-protection instead of /attack-protection/attack-protection.
export function AttackProtectionList() {
  return <AttackProtectionEdit id="attack-protection" />;
}
