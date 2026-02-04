import { CustomText, PromptScreen } from "../types";

export interface CustomTextAdapter {
  /**
   * Get custom text for a specific prompt screen and language
   */
  get: (
    tenant_id: string,
    prompt: PromptScreen,
    language: string,
  ) => Promise<CustomText | null>;

  /**
   * Set custom text for a specific prompt screen and language
   */
  set: (
    tenant_id: string,
    prompt: PromptScreen,
    language: string,
    customText: CustomText,
  ) => Promise<void>;

  /**
   * Delete custom text for a specific prompt screen and language
   */
  delete: (
    tenant_id: string,
    prompt: PromptScreen,
    language: string,
  ) => Promise<void>;

  /**
   * List all custom text entries for a tenant
   */
  list: (
    tenant_id: string,
  ) => Promise<Array<{ prompt: PromptScreen; language: string }>>;
}
