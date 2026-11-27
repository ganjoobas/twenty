import { lstat, opendir } from 'fs/promises';
import { join } from 'path';

export type WschatBridgeFolderSize = {
  bytes: number;
  // false: the time budget ran out and `bytes` covers only what was walked
  isComplete: boolean;
};

// Duck-typed: Node's fs errors are not always instances of this realm's Error
const isMissingPathError = (error: unknown) => {
  const code: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined;

  return code === 'ENOENT' || code === 'ENOTDIR';
};

// Sum of regular file sizes under `folderPath`; symbolic links are not followed. A missing folder is 0.
export const measureFolderSize = async ({
  folderPath,
  deadline,
  now = Date.now,
}: {
  folderPath: string;
  deadline: number;
  now?: () => number;
}): Promise<WschatBridgeFolderSize> => {
  let bytes = 0;
  const pendingFolders = [folderPath];

  while (pendingFolders.length > 0) {
    if (now() > deadline) {
      return { bytes, isComplete: false };
    }

    const currentFolder = pendingFolders.pop() as string;

    try {
      const directory = await opendir(currentFolder);

      for await (const entry of directory) {
        const entryPath = join(currentFolder, entry.name);

        if (entry.isDirectory()) {
          pendingFolders.push(entryPath);
        } else if (entry.isFile()) {
          bytes += (await lstat(entryPath)).size;
        }
      }
    } catch (error) {
      // Removed while walking, or never created for this workspace
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
  }

  return { bytes, isComplete: true };
};
