import { invoke } from "@tauri-apps/api/core";

import type { Host } from "./bindings/Host";
import type { SshConfigImport } from "./bindings/SshConfigImport";

export const importApi = {
  readSshConfig: () => invoke<SshConfigImport>("read_ssh_config"),
  importSshConfig: (aliases: string[]) => invoke<Host[]>("import_ssh_config", { aliases }),
};
