import { PromptSetting } from "../types";

export interface PromptSettingsAdapter {
  set: (
    tenant_id: string,
    promptSetting: Partial<PromptSetting>,
  ) => Promise<void>;
  get: (tenant_id: string) => Promise<PromptSetting>;
}
