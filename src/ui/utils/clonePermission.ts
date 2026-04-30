/**
 * src/ui/utils/clonePermission.ts
 *
 * Pure utility that maps (provider, visibility) → ClonePermission → CloneUIState.
 *
 * Separation of concerns:
 *   - repoVisibility.ts  → detects WHAT the repo IS
 *   - clonePermission.ts → decides WHAT TO DO with that info
 *   - CloneFromGitModal  → only consumes and renders
 *
 * Extensibility note:
 *   When GitLab/Bitbucket private support is added, update the
 *   `supportedPrivateProviders` list in `getClonePermission` and add the
 *   corresponding API query in repoVisibility.ts. No changes needed here
 *   in the UI layer.
 */

import type { GitProvider, RepoVisibility } from "./repoVisibility.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Canonical permission states derived from (provider, visibility).
 *
 * - ALLOWED                    → cloning is permitted
 * - BLOCKED_PRIVATE_NON_GITHUB → private repo on a non-GitHub provider
 * - BLOCKED_UNKNOWN_NON_GITHUB → provider is non-GitHub and visibility cannot
 *                                be confirmed (unknown_provider result) —
 *                                blocked by default to prevent bypass
 * - BLOCKED_NOT_FOUND          → 404 on GitHub (may be private without auth)
 * - BLOCKED_INVALID            → URL could not be parsed
 * - INDETERMINATE              → visibility unconfirmed for GitHub (SSH,
 *                                network error) — do not block
 * - PENDING                    → no URL entered yet / detection not started
 */
export type ClonePermission =
	| "ALLOWED"
	| "BLOCKED_PRIVATE_NON_GITHUB"
	| "BLOCKED_UNKNOWN_NON_GITHUB"
	| "BLOCKED_NOT_FOUND"
	| "BLOCKED_INVALID"
	| "INDETERMINATE"
	| "PENDING";

/**
 * UI-level state derived from a ClonePermission.
 * Consumed directly by CloneFromGitModal to control button and error message.
 */
export interface CloneUIState {
	/** Whether the clone button should be disabled due to a permission block */
	buttonDisabled: boolean;
	/** Error message to display below the URL field, or null if none */
	errorMessage: string | null;
}

// ── Permission mapping ─────────────────────────────────────────────────────

/**
 * Maps (provider, visibility) to a ClonePermission.
 *
 * `visibility` accepts `RepoVisibility | null`:
 *   - null  → detection has not started yet (PENDING)
 *   - other → result of detectRepoVisibility()
 *
 * `provider` is only relevant when visibility === 'private'.
 */
export function getClonePermission(
	provider: GitProvider | null,
	visibility: RepoVisibility | null,
): ClonePermission {
	if (visibility === null) return "PENDING";

	switch (visibility) {
		case "public":
			return "ALLOWED";

		case "private": {
			// Only GitHub is supported for private repo cloning
			const supportedPrivateProviders: GitProvider[] = ["github"];
			return supportedPrivateProviders.includes(provider!)
				? "ALLOWED"
				: "BLOCKED_PRIVATE_NON_GITHUB";
		}

		case "not_found":
			return "BLOCKED_NOT_FOUND";

		case "invalid_url":
			return "BLOCKED_INVALID";

		case "unknown_provider":
			// The IPC proxy cannot query non-GitHub providers.
			// If the provider is confirmed non-GitHub (or undetermined), block
			// by default to prevent bypass via unsupported providers.
			if (provider === "github") {
				// Should not normally happen (GitHub always gets a real status),
				// but treat conservatively as INDETERMINATE rather than blocking.
				return "INDETERMINATE";
			}
			return "BLOCKED_UNKNOWN_NON_GITHUB";

		case "ssh_url":
		case "network_error":
			return "INDETERMINATE";

		default:
			return "INDETERMINATE";
	}
}

// ── UI state mapping ───────────────────────────────────────────────────────

/**
 * Maps a ClonePermission to the concrete UI state consumed by the modal.
 */
export function getCloneUIState(permission: ClonePermission): CloneUIState {
	switch (permission) {
		case "ALLOWED":
			return { buttonDisabled: false, errorMessage: null };

		case "BLOCKED_PRIVATE_NON_GITHUB":
			return {
				buttonDisabled: true,
				errorMessage:
					"Currently, only GitHub repositories are supported for private repository cloning.",
			};

		case "BLOCKED_UNKNOWN_NON_GITHUB":
			return {
				buttonDisabled: true,
				errorMessage:
					"Currently, only GitHub repositories are supported for private repository cloning.",
			};

		case "BLOCKED_NOT_FOUND":
			return {
				buttonDisabled: true,
				errorMessage: "Repository not found. Check the URL and try again.",
			};

		case "BLOCKED_INVALID":
			return {
				buttonDisabled: true,
				errorMessage: "Invalid repository URL.",
			};

		case "INDETERMINATE":
			return { buttonDisabled: false, errorMessage: null };

		case "PENDING":
			return { buttonDisabled: false, errorMessage: null };

		default:
			return { buttonDisabled: false, errorMessage: null };
	}
}
