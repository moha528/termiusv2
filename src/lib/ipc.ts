import { invoke } from "@tauri-apps/api/core";
import type { CommandHistoryEntry } from "./bindings/CommandHistoryEntry";
import type { Group } from "./bindings/Group";
import type { GroupInput } from "./bindings/GroupInput";
import type { Host } from "./bindings/Host";
import type { HostInput } from "./bindings/HostInput";
import type { HostKeyLink } from "./bindings/HostKeyLink";
import type { HostTagLink } from "./bindings/HostTagLink";
import type { Identity } from "./bindings/Identity";
import type { IdentityInput } from "./bindings/IdentityInput";
import type { IdentityKeyLink } from "./bindings/IdentityKeyLink";
import type { KnownHost } from "./bindings/KnownHost";
import type { PortForward } from "./bindings/PortForward";
import type { PortForwardInput } from "./bindings/PortForwardInput";
import type { Snippet } from "./bindings/Snippet";
import type { SnippetInput } from "./bindings/SnippetInput";
import type { SshKey } from "./bindings/SshKey";
import type { SshKeyAlgorithm } from "./bindings/SshKeyAlgorithm";
import type { SyncConfigInput } from "./bindings/SyncConfigInput";
import type { SyncResult } from "./bindings/SyncResult";
import type { SyncState } from "./bindings/SyncState";
import type { Tag } from "./bindings/Tag";
import type { TagInput } from "./bindings/TagInput";

export const hostsApi = {
  list: () => invoke<Host[]>("list_hosts"),
  create: (input: HostInput) => invoke<Host>("create_host", { input }),
  update: (id: string, input: HostInput) => invoke<Host>("update_host", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_host", { id }),
};

export const groupsApi = {
  list: () => invoke<Group[]>("list_groups"),
  create: (input: GroupInput) => invoke<Group>("create_group", { input }),
  update: (id: string, input: GroupInput) => invoke<Group>("update_group", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_group", { id }),
  moveHost: (hostId: string, groupId: string | null) =>
    invoke<void>("move_host_to_group", { hostId, groupId }),
};

export const tagsApi = {
  list: () => invoke<Tag[]>("list_tags"),
  create: (input: TagInput) => invoke<Tag>("create_tag", { input }),
  update: (id: string, input: TagInput) => invoke<Tag>("update_tag", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_tag", { id }),
  setHostTags: (hostId: string, tagIds: string[]) =>
    invoke<void>("set_host_tags", { hostId, tagIds }),
  listLinks: () => invoke<HostTagLink[]>("list_host_tag_links"),
};

export const knownHostsApi = {
  list: () => invoke<KnownHost[]>("list_known_hosts"),
  forget: (hostname: string, port: number) =>
    invoke<boolean>("forget_known_host", { hostname, port }),
};

export const vaultApi = {
  hasPin: () => invoke<boolean>("vault_has_pin"),
  verify: (pin: string) => invoke<boolean>("vault_verify_pin", { pin }),
  setPin: (newPin: string) => invoke<void>("vault_set_pin", { newPin }),
  changePin: (currentPin: string, newPin: string) =>
    invoke<void>("vault_change_pin", { currentPin, newPin }),
  disablePin: (currentPin: string) => invoke<void>("vault_disable_pin", { currentPin }),
};

export const portForwardsApi = {
  listForHost: (hostId: string) => invoke<PortForward[]>("list_port_forwards", { hostId }),
  create: (input: PortForwardInput) => invoke<PortForward>("create_port_forward", { input }),
  update: (id: string, input: PortForwardInput) =>
    invoke<PortForward>("update_port_forward", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_port_forward", { id }),
  start: (id: string) => invoke<void>("start_port_forward", { id }),
  stop: (id: string) => invoke<void>("stop_port_forward", { id }),
  listActive: () => invoke<string[]>("list_active_port_forwards"),
  stopAll: () => invoke<number>("stop_all_port_forwards"),
};

export const identitiesApi = {
  list: () => invoke<Identity[]>("list_identities"),
  create: (input: IdentityInput) => invoke<Identity>("create_identity", { input }),
  update: (id: string, input: IdentityInput) => invoke<Identity>("update_identity", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_identity", { id }),
  setKeys: (identityId: string, keyIds: string[]) =>
    invoke<void>("set_identity_keys", { identityId, keyIds }),
  listLinks: () => invoke<IdentityKeyLink[]>("list_identity_key_links"),
};

export const snippetsApi = {
  list: () => invoke<Snippet[]>("list_snippets"),
  create: (input: SnippetInput) => invoke<Snippet>("create_snippet", { input }),
  update: (id: string, input: SnippetInput) => invoke<Snippet>("update_snippet", { id, input }),
  delete: (id: string) => invoke<boolean>("delete_snippet", { id }),
  extractVariables: (content: string) => invoke<string[]>("extract_snippet_variables", { content }),
  render: (content: string, values: Record<string, string>) =>
    invoke<string>("render_snippet", { content, values }),
};

export type ImportStats = {
  hosts_added: number;
  groups_added: number;
  tags_added: number;
  identities_added: number;
  snippets_added: number;
  port_forwards_added: number;
  hosts_replaced: number;
};

export const syncGitApi = {
  getState: () => invoke<SyncState | null>("sync_get_state"),
  testConnection: (input: SyncConfigInput, pat: string | null) =>
    invoke<void>("sync_test_connection", { input, pat }),
  configure: (input: SyncConfigInput, pat: string | null) =>
    invoke<SyncState>("sync_configure", { input, pat }),
  disable: () => invoke<void>("sync_disable"),
  forgetPat: () => invoke<void>("sync_forget_pat"),
  setPassword: (password: string) => invoke<void>("sync_set_password", { password }),
  hasPassword: () => invoke<boolean>("sync_has_password"),
  pushNow: () => invoke<SyncResult>("sync_push_now"),
  pullNow: () => invoke<SyncResult>("sync_pull_now"),
};

export const vaultExportApi = {
  /** Returns the byte size of the written file. */
  export: (password: string, path: string) => invoke<number>("export_vault", { password, path }),
  import: (password: string, path: string, mode: "merge" | "replace") =>
    invoke<ImportStats>("import_vault", { password, path, mode }),
};

export const commandHistoryApi = {
  list: (hostId: string | null, limit?: number) =>
    invoke<CommandHistoryEntry[]>("list_command_history", {
      hostId,
      limit: limit ?? null,
    }),
  clear: (hostId: string | null) => invoke<number>("clear_command_history", { hostId }),
};

export const sshKeysApi = {
  list: () => invoke<SshKey[]>("list_ssh_keys"),
  generate: (name: string, algorithm: SshKeyAlgorithm, passphrase: string | null) =>
    invoke<SshKey>("generate_ssh_key", { name, algorithm, passphrase }),
  import: (filePath: string, name: string, passphrase: string | null) =>
    invoke<SshKey>("import_ssh_key", { filePath, name, passphrase }),
  delete: (id: string) => invoke<boolean>("delete_ssh_key", { id }),
  listHostLinks: () => invoke<HostKeyLink[]>("list_host_key_links"),
  setHostKeys: (hostId: string, keyIds: string[]) =>
    invoke<void>("set_host_keys", { hostId, keyIds }),
};
