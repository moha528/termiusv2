import { invoke } from "@tauri-apps/api/core";
import type { Host } from "./bindings/Host";
import type { HostInput } from "./bindings/HostInput";

export const hostsApi = {
  list: () => invoke<Host[]>("list_hosts"),
  create: (input: HostInput) => invoke<Host>("create_host", { input }),
  update: (id: string, input: HostInput) => invoke<Host>("update_host", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_host", { id }),
};
