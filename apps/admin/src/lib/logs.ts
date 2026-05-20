export {
  LogTypes,
  logTypeDescriptions,
  logTypeCategories,
  getLogTypeDescription,
  getLogTypeCategory,
} from "@authhero/adapter-interfaces";
export type { LogType, LogCategory } from "@authhero/adapter-interfaces";

import type { LogType } from "@authhero/adapter-interfaces";
// Keep backward-compatible alias: existing code imports `LogTypes` as a type.
export type LogTypes = LogType;
