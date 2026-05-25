/**
 * URL resolution helpers for the frontend API client.
 * Pure module: no React, no fetch, no localStorage.
 *
 * D-05: VITE_API_BASE_URL unset → '/api'
 * D-06: Avatar paths returned relative (same-origin); absolute URLs passed through
 * D-08: Trailing slash normalised on base only; path segments preserved
 * D-13: VITE_LLM_API_URL unset → '/api/chat'
 */

/**
 * Returns the API base URL, defaulting to '/api' when VITE_API_BASE_URL is unset.
 * Trailing slash is stripped from the base so joinApiPath never produces '//'.
 */
export function resolveApiBaseUrl() {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (!env || env === '') return '/api';
  return env.replace(/\/+$/, '');
}

/**
 * Joins a base URL and a path segment, ensuring exactly one '/' between them.
 * @param {string} base - Base URL (no trailing slash expected after resolveApiBaseUrl)
 * @param {string} path - API path segment; must start with '/'
 */
export function joinApiPath(base, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Returns the LLM chat API URL, defaulting to '/api/chat' when VITE_LLM_API_URL is unset.
 */
export function resolveLlmApiUrl() {
  const env = import.meta.env.VITE_LLM_API_URL;
  if (!env || env === '') return '/api/chat';
  return env.replace(/\/+$/, '');
}

/**
 * Resolves an avatar path to a displayable URL.
 * - Absolute URLs (http/https) are returned as-is.
 * - Paths starting with '/' are returned unchanged (same-origin relative).
 * - Bare filenames are prefixed with /avatars/.
 * @param {string|null|undefined} avatarPath
 */
export function resolveAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http')) return avatarPath;
  if (avatarPath.startsWith('/')) return avatarPath;
  return `/avatars/${avatarPath}`;
}
