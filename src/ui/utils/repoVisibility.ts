/**
 * src/ui/utils/repoVisibility.ts
 *
 * Pure utility for detecting whether a Git repository is public or private.
 *
 * ⚠️  IMPORTANT — CSP CONSTRAINT:
 * The renderer process is blocked by Content Security Policy from making
 * direct fetch() calls to external domains (e.g. api.github.com).
 * ALL external HTTP calls MUST go through the IPC proxy:
 *   window.agentsFlow.githubFetch(req)
 *
 * The proxy only supports GitHub (https://api.github.com/).
 * GitLab and Bitbucket are not proxied → returns "unknown_provider".
 * SSH URLs and unknown providers are handled as non-queryable states.
 */

import type {
	GitHubFetchRequest,
	GitHubFetchResult,
} from "../../electron/bridge.types.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export interface ParsedRepoUrl {
	provider: GitProvider;
	owner: string;
	repo: string; // without .git
	rawUrl: string;
}

/**
 * All possible outcomes of a visibility detection attempt.
 * "checking" and "idle" are UI-level states added in VisibilityStatus below.
 */
export type RepoVisibility =
	| "public" // 200 OK — accessible without authentication
	| "private" // 401/403/404 — exists but requires credentials (or not found)
	| "not_found" // explicit 404 — treated as private in the UI
	| "unknown_provider" // hostname is not GitHub, or is GitLab/Bitbucket (no proxy support)
	| "ssh_url" // SSH URL — not queryable via REST API
	| "network_error" // no connection, timeout, IPC unavailable, or rate-limited (429)
	| "invalid_url"; // URL could not be parsed

/**
 * Superset of RepoVisibility that includes transient UI states.
 * Used as the canonical status type shared between the modal and the badge.
 */
export type VisibilityStatus = RepoVisibility | "checking" | "idle";

// ── IPC bridge accessor ────────────────────────────────────────────────────

/**
 * Returns the githubFetch proxy from the Electron context bridge, or null
 * if the bridge is not available (e.g. running in a plain browser / tests
 * without the mock set up).
 */
function getGithubFetchProxy(): ((req: GitHubFetchRequest) => Promise<GitHubFetchResult>) | null {
	try {
		const bridge = (
			window as unknown as {
				agentsFlow?: {
					githubFetch?: (req: GitHubFetchRequest) => Promise<GitHubFetchResult>;
				};
			}
		).agentsFlow;
		return bridge?.githubFetch ?? null;
	} catch {
		return null;
	}
}

// ── Parseo ─────────────────────────────────────────────────────────────────

/**
 * Parses a Git HTTPS/HTTP URL and extracts provider, owner and repo name.
 * Returns null for SSH URLs or any URL that cannot be decomposed into
 * exactly two non-empty path segments (owner/repo).
 */
export function parseRepoUrl(url: string): ParsedRepoUrl | null {
	const trimmed = url.trim();

	// SSH shorthand (git@host:org/repo) — not queryable
	if (/^[\w.-]+@[\w.-]+:/.test(trimmed)) return null;

	// Must be http:// or https://
	if (!/^https?:\/\//i.test(trimmed)) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	const hostname = parsed.hostname.toLowerCase();

	// Detect provider
	let provider: GitProvider = "unknown";
	if (hostname === "github.com" || hostname.endsWith(".github.com")) {
		provider = "github";
	} else if (hostname === "gitlab.com") {
		provider = "gitlab";
	} else if (hostname === "bitbucket.org") {
		provider = "bitbucket";
	}

	// Extract path segments, stripping query/hash (URL constructor does this)
	// pathname starts with '/', e.g. "/owner/repo.git"
	const segments = parsed.pathname
		.split("/")
		.filter(Boolean) // remove empty strings from leading/trailing '/'
		.map((s) => s.replace(/\.git$/i, ""));

	// Only support /owner/repo paths (exactly 2 non-empty segments)
	if (segments.length < 2) return null;

	const owner = segments[0];
	const repo = segments[1];

	if (!owner || !repo) return null;

	return { provider, owner, repo: encodeURIComponent(repo), rawUrl: trimmed };
}

// ── API URL builder (GitHub only — proxy enforces this) ────────────────────

/**
 * Builds the full GitHub API URL for a parsed repo.
 * Only GitHub is supported by the IPC proxy.
 */
function buildGithubApiUrl(parsed: ParsedRepoUrl): string {
	const { owner, repo } = parsed;
	return `https://api.github.com/repos/${owner}/${repo}`;
}

// ── Main detection function ────────────────────────────────────────────────

/**
 * Detects whether the repository at `url` is publicly accessible.
 *
 * Uses the IPC proxy `window.agentsFlow.githubFetch` exclusively — no direct
 * fetch() calls to external domains are made from the renderer.
 *
 * Only GitHub repositories are supported. GitLab and Bitbucket URLs will
 * return "unknown_provider" because the IPC proxy only accepts
 * https://api.github.com/ endpoints.
 *
 * @param url       - Raw URL string from the user input field.
 * @param token     - Optional GitHub personal access token.
 * @returns         - A `RepoVisibility` value describing the result.
 */
export async function detectRepoVisibility(
	url: string,
	token?: string,
): Promise<RepoVisibility> {
	const trimmed = url.trim();

	// SSH shorthand early-exit
	if (/^[\w.-]+@[\w.-]+:/.test(trimmed)) return "ssh_url";
	// Non-HTTP schemes (ssh://, git://)
	if (/^(ssh|git):\/\//i.test(trimmed)) return "ssh_url";

	const parsed = parseRepoUrl(trimmed);
	if (!parsed) return "invalid_url";

	// Only GitHub is supported by the IPC proxy
	if (parsed.provider !== "github") return "unknown_provider";

	// Guard: proxy must be available
	const githubFetch = getGithubFetchProxy();
	if (!githubFetch) {
		return "network_error"; // IPC bridge not available
	}

	const apiUrl = buildGithubApiUrl(parsed);

	let result: GitHubFetchResult;
	try {
		result = await githubFetch({ url: apiUrl, token });
	} catch {
		return "network_error";
	}

	// Proxy always resolves — check errorCode first, then HTTP status
	if (result.errorCode === "INVALID_URL") {
		// Should not happen if buildGithubApiUrl is correct
		return "invalid_url";
	}
	if (result.errorCode === "NETWORK_ERROR" || result.errorCode === "UNKNOWN") {
		return "network_error";
	}

	// If no errorCode, use the HTTP status to determine visibility
	const status = result.status ?? 0;

	if (status >= 200 && status < 300) return "public";
	if (status === 401) return "private"; // Unauthorized
	if (status === 403) return "private"; // Forbidden
	if (status === 404) return "not_found"; // Treat as private in UI
	if (status === 429) return "network_error"; // Rate-limited
	if (status === 0) return "network_error"; // No status at all — something went wrong
	return "private"; // Any other non-ok status
}
