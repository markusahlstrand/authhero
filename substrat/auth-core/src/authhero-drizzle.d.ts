// Local shim: @authhero/drizzle declares `types: ./dist/drizzle-adapter.d.ts`
// but its build (`tsc && vite build`) never emits it — upstream paper-cut. The
// schema subpath IS typed (exports src .ts directly); only the default export
// needs this declaration. Remove once the package build emits its own types.
declare module "@authhero/drizzle" {
  import type { DataAdapters } from "@authhero/adapter-interfaces";

  export interface CreateAdaptersOptions {
    useTransactions?: boolean;
    controlPlane?: boolean;
  }

  export default function createAdapters(
    db: unknown,
    options?: CreateAdaptersOptions,
  ): DataAdapters;
}
