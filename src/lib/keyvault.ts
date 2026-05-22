import { invoke } from "@tauri-apps/api/core";

/**
 * Front-facing API for the OS keychain. Accounts are host UUIDs.
 *
 * Calls are silent: errors are caught and logged so the UI can fall back to
 * prompting the user instead of breaking the flow.
 */
export const keyvaultApi = {
  async save(hostId: string, password: string): Promise<void> {
    await invoke("save_host_password", { hostId, password });
  },
  async get(hostId: string): Promise<string | null> {
    try {
      return (await invoke<string | null>("get_host_password", { hostId })) ?? null;
    } catch (e) {
      console.warn("keyvault.get:", e);
      return null;
    }
  },
  async delete(hostId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("delete_host_password", { hostId });
    } catch (e) {
      console.warn("keyvault.delete:", e);
      return false;
    }
  },
  async has(hostId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("has_host_password", { hostId });
    } catch (e) {
      console.warn("keyvault.has:", e);
      return false;
    }
  },
};
