// ---- External URLs (single source of truth) ----

export const REPO_URL = 'https://github.com/editor-code-assistant/eca-plugins';
export const SITE_URL = 'https://eca.dev';

/** GitHub avatar URL for a given user and pixel size. */
export function githubAvatarUrl(author: string, size: number): string {
  return `https://github.com/${author}.png?size=${size}`;
}

/** GitHub URL to the source directory of a plugin. */
export function pluginSourceUrl(source: string): string {
  return `${REPO_URL}/tree/master/${source}`;
}
