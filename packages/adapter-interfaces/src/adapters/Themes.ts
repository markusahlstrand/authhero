import { ThemeInsert, Theme } from "../types/Theme";
import { CreateOptions } from "../types/ImportMetadata";

export interface ThemesAdapter {
  /**
   * Single source of truth for the new row's id: `options.importMetadata.id`
   * takes precedence, then the positional `themeId`, then a generated id. Every
   * adapter must honor this same precedence so imports preserve source ids
   * regardless of backend.
   */
  create: (
    tenant_id: string,
    theme: ThemeInsert,
    themeId?: string,
    options?: CreateOptions,
  ) => Promise<Theme>;
  remove: (tenant_id: string, themeId: string) => Promise<boolean>;
  get: (tenant_id: string, themeId: string) => Promise<Theme | null>;
  list: (tenant_id: string) => Promise<Theme[]>;
  update: (
    tenant_id: string,
    themeId,
    theme: Partial<ThemeInsert>,
  ) => Promise<boolean>;
}
