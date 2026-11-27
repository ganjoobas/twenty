import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { measureFolderSize } from 'src/engine/core-modules/wschat-bridge/utils/measure-folder-size.util';

describe('measureFolderSize', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'wschat-bridge-size-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('should add up every file below the folder without following links', async () => {
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, 'one.txt'), 'x'.repeat(10));
    await writeFile(join(root, 'a', 'b', 'two.bin'), 'y'.repeat(25));
    await symlink(join(root, 'one.txt'), join(root, 'a', 'link'));

    await expect(
      measureFolderSize({ folderPath: root, deadline: Date.now() + 10_000 }),
    ).resolves.toEqual({ bytes: 35, isComplete: true });
  });

  it('should read a missing folder as empty', async () => {
    await expect(
      measureFolderSize({
        folderPath: join(root, 'absent'),
        deadline: Date.now() + 10_000,
      }),
    ).resolves.toEqual({ bytes: 0, isComplete: true });
  });

  it('should stop at the deadline and say the count is partial', async () => {
    await writeFile(join(root, 'one.txt'), 'x');

    await expect(
      measureFolderSize({ folderPath: root, deadline: 0, now: () => 1 }),
    ).resolves.toEqual({ bytes: 0, isComplete: false });
  });
});
