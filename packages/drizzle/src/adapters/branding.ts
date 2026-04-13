import { eq } from "drizzle-orm";
import type { Branding } from "@authhero/adapter-interfaces";
import { branding } from "../schema/sqlite";
import { removeNullProperties } from "../helpers/transform";
import type { DrizzleDb } from "./types";

export function createBrandingAdapter(db: DrizzleDb) {
  return {
    async get(tenant_id: string): Promise<Branding | null> {
      const result = await db
        .select()
        .from(branding)
        .where(eq(branding.tenant_id, tenant_id))
        .get();

      if (!result) return null;

      const {
        tenant_id: _,
        colors_primary,
        colors_page_background_type,
        colors_page_background_start,
        colors_page_background_end,
        colors_page_background_angle_dev,
        font_url,
        ...rest
      } = result;

      return removeNullProperties({
        ...rest,
        colors: {
          primary: colors_primary,
          page_background: {
            type: colors_page_background_type,
            start: colors_page_background_start,
            end: colors_page_background_end,
            angle_deg: colors_page_background_angle_dev,
          },
        },
        font: font_url ? { url: font_url } : undefined,
      });
    },

    async set(tenant_id: string, data: Branding): Promise<void> {
      const { colors, font, ...rest } = data;

      const values = {
        ...rest,
        tenant_id,
        colors_primary: colors?.primary,
        colors_page_background_type: colors?.page_background?.type,
        colors_page_background_start: colors?.page_background?.start,
        colors_page_background_end: colors?.page_background?.end,
        colors_page_background_angle_dev: colors?.page_background?.angle_deg,
        font_url: font?.url,
      };

      await db
        .insert(branding)
        .values(values)
        .onConflictDoUpdate({
          target: branding.tenant_id,
          set: {
            ...rest,
            colors_primary: colors?.primary,
            colors_page_background_type: colors?.page_background?.type,
            colors_page_background_start: colors?.page_background?.start,
            colors_page_background_end: colors?.page_background?.end,
            colors_page_background_angle_dev:
              colors?.page_background?.angle_deg,
            font_url: font?.url,
          },
        });
    },
  };
}
