declare module "dynalite" {
  import { Server } from "http";

  interface DynaliteOptions {
    createTableMs?: number;
    deleteTableMs?: number;
    updateTableMs?: number;
    maxItemSizeKb?: number;
    ssl?: {
      key: string;
      cert: string;
    };
  }

  interface DynaliteServer extends Server {
    listen(port: number, callback?: () => void): this;
    close(callback?: () => void): this;
  }

  function dynalite(options?: DynaliteOptions): DynaliteServer;

  export = dynalite;
}
