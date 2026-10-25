/** Prefix a root-relative path with the site base (GitHub Pages project path). */
export function u(path: string): string {
  if (/^(?:[a-z]+:|\/\/)/i.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const stripped = path.replace(/^\//, '');
  return `${normalizedBase}${stripped}`;
}

/** Pathname with the base removed, always trailing-slashed. */
export function normalizePath(pathname: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  let path = pathname || '/';
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.endsWith('/')) path = `${path}/`;
  return path;
}
