/**
 * src/ui/utils/gitUrlUtils.ts
 *
 * Pure helpers for Git URL validation used by the Clone from Git modal.
 *
 * Supported URL schemes:
 *   - HTTPS   https://github.com/org/repo.git
 *   - HTTP    http://github.com/org/repo.git     (insecure but valid Git URL)
 *   - SSH     git@github.com:org/repo.git
 *   - Git     git://github.com/org/repo.git
 *   - SSH+    ssh://git@github.com/org/repo.git
 *
 * Validation does NOT make any network calls — purely syntactic.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface GitUrlValidation {
	/** Whether the URL is syntactically valid as a Git remote */
	valid: boolean;
	/** Human-readable error message; undefined when valid === true */
	error?: string;
	/** Detected scheme; undefined when valid === false */
	scheme?: "https" | "http" | "ssh" | "git" | "ssh+git";
}

// ── Regex patterns ─────────────────────────────────────────────────────────

/**
 * HTTPS/HTTP: https://host/path  or  http://host/path
 * At minimum requires a non-empty host and at least one path segment.
 */
const HTTPS_RE = /^https?:\/\/[^\s/$.?#][^\s]*/i;

/**
 * SSH shorthand: git@host:path
 * e.g. git@github.com:org/repo.git
 */
const SSH_SHORTHAND_RE = /^[\w.-]+@[\w.-]+:[^\s]+/;

/**
 * git:// protocol
 * e.g. git://github.com/org/repo.git
 */
const GIT_PROTOCOL_RE = /^git:\/\/[^\s/$.?#][^\s]*/i;

/**
 * ssh:// protocol (full form)
 * e.g. ssh://git@github.com/org/repo.git
 */
const SSH_PROTOCOL_RE = /^ssh:\/\/[^\s/$.?#][^\s]*/i;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validates a Git remote URL string.
 *
 * Returns a `GitUrlValidation` object with `valid`, optional `error`, and
 * optional `scheme` (when valid).
 *
 * @param raw - The raw string typed by the user. May be blank.
 *
 * @example
 * validateGitUrl("https://github.com/org/repo.git")
 * // → { valid: true, scheme: "https" }
 *
 * validateGitUrl("git@github.com:org/repo.git")
 * // → { valid: true, scheme: "ssh" }
 *
 * validateGitUrl("not-a-url")
 * // → { valid: false, error: "Invalid Git URL. ..." }
 *
 * validateGitUrl("")
 * // → { valid: false }   ← no error message for empty input
 */
export function validateGitUrl(raw: string): GitUrlValidation {
	const trimmed = raw.trim();

	// Blank input — caller decides how to treat this (required-field validation
	// is separate from format validation).
	if (!trimmed) {
		return { valid: false };
	}

	if (HTTPS_RE.test(trimmed)) {
		return {
			valid: true,
			scheme: trimmed.startsWith("https") ? "https" : "http",
		};
	}

	if (SSH_SHORTHAND_RE.test(trimmed)) {
		return { valid: true, scheme: "ssh" };
	}

	if (GIT_PROTOCOL_RE.test(trimmed)) {
		return { valid: true, scheme: "git" };
	}

	if (SSH_PROTOCOL_RE.test(trimmed)) {
		return { valid: true, scheme: "ssh+git" };
	}

	return {
		valid: false,
		error:
			"Invalid Git URL. Accepted formats: " +
			"https://host/org/repo.git, " +
			"git@host:org/repo.git, " +
			"git://host/org/repo.git, " +
			"ssh://git@host/org/repo.git",
	};
}

/**
 * Returns true when `url` is a non-empty, syntactically valid Git remote URL.
 * Convenience wrapper around `validateGitUrl` for use in boolean contexts.
 */
export function isValidGitUrl(url: string): boolean {
	return validateGitUrl(url).valid;
}
