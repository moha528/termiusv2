import { useMemo } from "react";

import { localAdapter, makeRemoteAdapter } from "@/lib/fs";

import { FilePane } from "./FilePane";

type Props = {
  sessionId: string;
};

/**
 * Side-by-side Local / Remote file browser.
 *
 * Both panes share the same `FileEntry` shape and the same actions through
 * the `FsAdapter` abstraction defined in `lib/fs.ts`. Upload/download and
 * drag&drop between the two are layered on top in P2-T11.
 */
export function SftpView({ sessionId }: Props) {
  const remoteAdapter = useMemo(() => makeRemoteAdapter(sessionId), [sessionId]);

  return (
    <div className="flex h-full w-full bg-(--color-bg)">
      <FilePane adapter={localAdapter} title="Local" />
      <FilePane adapter={remoteAdapter} title="Remote" />
    </div>
  );
}
