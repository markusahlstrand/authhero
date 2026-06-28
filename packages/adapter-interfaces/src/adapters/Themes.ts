import { ThemeInsert, Theme } from "../types/Theme";
import { CreateOptions } from "../types/ImportMetadata";

export interface ThemesAdapter {
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
