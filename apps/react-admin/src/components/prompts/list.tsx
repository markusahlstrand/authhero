import { PromptsEdit } from "./edit";

// Singleton resource — render the edit form at the list URL
// so the path stays /prompts instead of /prompts/prompts.
export function PromptsList() {
  return <PromptsEdit id="prompts" />;
}
