/** Сократить абсолютный путь, заменив $HOME префикс на `~`. */
export function shortenPath(path: string, home: string | null | undefined): string {
  if (!path) return path;
  if (home && path === home) return "~";
  if (home && path.startsWith(home + "/")) {
    return "~" + path.slice(home.length);
  }
  return path;
}
