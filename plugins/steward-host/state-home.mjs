import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { closeSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';

// Mirrors stock resolveDshHome() for absolute overrides and the OS-home default.
// Relative overrides (including tilde) are not appropriate for a durable one-shot gate.
export function stateDirectory() {
  const override = process.env.DSH_HOME;
  const explicit = !!override?.trim();
  const root = explicit ? override : join(homedir(), '.dsh');
  if (!isAbsolute(root) || root.split('/').includes('..') || resolve(root) === '/') throw Error('unsafe DSH home');
  const uid = process.getuid();
  const stat = path => lstatSync(path, {throwIfNoEntry:false});
  const directory = (path, mask) => {
    const s = stat(path);
    if (!s?.isDirectory() || s.uid !== uid || (s.mode & mask)) throw Error('unsafe state directory');
  };
  // Reject symlinks in the selected path, except Darwin's root-owned /tmp and /var aliases.
  const path = resolve(root);
  const canonical = realpathSync(dirname(path));
  const expectedParent = process.platform === 'darwin' ? dirname(path).replace(/^\/(tmp|var)(?=\/|$)/,'/private/$1') : dirname(path);
  if (canonical !== expectedParent) throw Error('unsafe DSH home parent');
  if (!explicit) {
    directory(dirname(path), 0o022);
    if (!stat(path)) mkdirSync(path,{mode:0o700});
  }
  directory(path,0o022);
  const dir = join(realpathSync(path),'steward-host-private');
  if (!stat(dir)) mkdirSync(dir,{mode:0o700});
  directory(dir,0o077);
  for (const base of ['core.sqlite','host.sqlite']) for (const suffix of ['', '-wal','-shm','-journal']) {
    const file=join(dir,base+suffix), s=stat(file);
    if (s && (!s.isFile() || s.uid!==uid || s.nlink!==1 || (s.mode & 0o022))) throw Error('unsafe state');
    if (!s && !suffix) closeSync(openSync(file,'wx',0o600));
  }
  return dir;
}
