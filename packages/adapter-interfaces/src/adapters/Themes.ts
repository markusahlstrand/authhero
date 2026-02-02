import { ThemeInsert, Theme } from "../types/Theme";

export interface ThemesAdapter {
  create: (
    tenant_id: string,
    theme: ThemeInsert,
    themeId?: string,
  ) => Promise<Theme>;
  remove: (tenant_id: string, themeId: string) => Promise<boolean>;
  get: (tenant_id: string, themeId: string) => Promise<Theme | null>;
  update: (
    tenant_id: string,
    themeId,
    theme: Partial<ThemeInsert>,
  ) => Promise<boolean>;
}
