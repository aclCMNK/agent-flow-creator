/**
 * tests/ui/clone-permission.test.ts
 *
 * Unit tests for src/ui/utils/clonePermission.ts
 *
 * Covers the mapping (provider, visibility) → ClonePermission → CloneUIState,
 * with special focus on the non-GitHub blocking rules (point 2 of the spec).
 */

import { describe, it, expect } from "bun:test";
import {
	getClonePermission,
	getCloneUIState,
} from "../../src/ui/utils/clonePermission.ts";
import type { GitProvider, RepoVisibility } from "../../src/ui/utils/repoVisibility.ts";

// ── getClonePermission ─────────────────────────────────────────────────────

describe("getClonePermission — public repos are always ALLOWED", () => {
	const providers: Array<GitProvider | null> = ["github", "gitlab", "bitbucket", "unknown", null];

	for (const provider of providers) {
		it(`provider=${provider ?? "null"} + visibility=public → ALLOWED`, () => {
			expect(getClonePermission(provider, "public")).toBe("ALLOWED");
		});
	}
});

describe("getClonePermission — private repos", () => {
	it("GitHub + private → ALLOWED (GitHub private is supported)", () => {
		expect(getClonePermission("github", "private")).toBe("ALLOWED");
	});

	it("GitLab + private → BLOCKED_PRIVATE_NON_GITHUB", () => {
		expect(getClonePermission("gitlab", "private")).toBe("BLOCKED_PRIVATE_NON_GITHUB");
	});

	it("Bitbucket + private → BLOCKED_PRIVATE_NON_GITHUB", () => {
		expect(getClonePermission("bitbucket", "private")).toBe("BLOCKED_PRIVATE_NON_GITHUB");
	});

	it("unknown provider + private → BLOCKED_PRIVATE_NON_GITHUB", () => {
		expect(getClonePermission("unknown", "private")).toBe("BLOCKED_PRIVATE_NON_GITHUB");
	});

	it("null provider + private → BLOCKED_PRIVATE_NON_GITHUB", () => {
		expect(getClonePermission(null, "private")).toBe("BLOCKED_PRIVATE_NON_GITHUB");
	});
});

describe("getClonePermission — unknown_provider (non-GitHub blocked by default)", () => {
	it("GitLab + unknown_provider → BLOCKED_UNKNOWN_NON_GITHUB", () => {
		expect(getClonePermission("gitlab", "unknown_provider")).toBe("BLOCKED_UNKNOWN_NON_GITHUB");
	});

	it("Bitbucket + unknown_provider → BLOCKED_UNKNOWN_NON_GITHUB", () => {
		expect(getClonePermission("bitbucket", "unknown_provider")).toBe("BLOCKED_UNKNOWN_NON_GITHUB");
	});

	it("unknown provider + unknown_provider → BLOCKED_UNKNOWN_NON_GITHUB", () => {
		expect(getClonePermission("unknown", "unknown_provider")).toBe("BLOCKED_UNKNOWN_NON_GITHUB");
	});

	it("null provider + unknown_provider → BLOCKED_UNKNOWN_NON_GITHUB", () => {
		// Provider could not be determined — block by default to prevent bypass
		expect(getClonePermission(null, "unknown_provider")).toBe("BLOCKED_UNKNOWN_NON_GITHUB");
	});

	it("GitHub + unknown_provider → INDETERMINATE (conservative, not blocking)", () => {
		// Edge case: GitHub URL that somehow returned unknown_provider
		expect(getClonePermission("github", "unknown_provider")).toBe("INDETERMINATE");
	});
});

describe("getClonePermission — other visibility states", () => {
	it("not_found → BLOCKED_NOT_FOUND", () => {
		expect(getClonePermission("github", "not_found")).toBe("BLOCKED_NOT_FOUND");
	});

	it("invalid_url → BLOCKED_INVALID", () => {
		expect(getClonePermission(null, "invalid_url")).toBe("BLOCKED_INVALID");
	});

	it("ssh_url → INDETERMINATE", () => {
		expect(getClonePermission("github", "ssh_url")).toBe("INDETERMINATE");
	});

	it("network_error → INDETERMINATE", () => {
		expect(getClonePermission("github", "network_error")).toBe("INDETERMINATE");
	});

	it("null visibility → PENDING", () => {
		expect(getClonePermission("github", null)).toBe("PENDING");
	});
});

// ── getCloneUIState ────────────────────────────────────────────────────────

describe("getCloneUIState — BLOCKED_PRIVATE_NON_GITHUB", () => {
	it("disables button", () => {
		const { buttonDisabled } = getCloneUIState("BLOCKED_PRIVATE_NON_GITHUB");
		expect(buttonDisabled).toBe(true);
	});

	it("shows the correct error message", () => {
		const { errorMessage } = getCloneUIState("BLOCKED_PRIVATE_NON_GITHUB");
		expect(errorMessage).toBe(
			"Currently, only GitHub repositories are supported for private repository cloning.",
		);
	});
});

describe("getCloneUIState — BLOCKED_UNKNOWN_NON_GITHUB", () => {
	it("disables button", () => {
		const { buttonDisabled } = getCloneUIState("BLOCKED_UNKNOWN_NON_GITHUB");
		expect(buttonDisabled).toBe(true);
	});

	it("shows the same message as BLOCKED_PRIVATE_NON_GITHUB", () => {
		const { errorMessage } = getCloneUIState("BLOCKED_UNKNOWN_NON_GITHUB");
		expect(errorMessage).toBe(
			"Currently, only GitHub repositories are supported for private repository cloning.",
		);
	});
});

describe("getCloneUIState — non-blocking states", () => {
	const nonBlockingStates = ["ALLOWED", "INDETERMINATE", "PENDING"] as const;

	for (const state of nonBlockingStates) {
		it(`${state} → buttonDisabled=false, errorMessage=null`, () => {
			const { buttonDisabled, errorMessage } = getCloneUIState(state);
			expect(buttonDisabled).toBe(false);
			expect(errorMessage).toBeNull();
		});
	}
});

describe("getCloneUIState — BLOCKED_NOT_FOUND", () => {
	it("disables button", () => {
		expect(getCloneUIState("BLOCKED_NOT_FOUND").buttonDisabled).toBe(true);
	});

	it("shows not-found message", () => {
		expect(getCloneUIState("BLOCKED_NOT_FOUND").errorMessage).toBeTruthy();
	});
});

describe("getCloneUIState — BLOCKED_INVALID", () => {
	it("disables button", () => {
		expect(getCloneUIState("BLOCKED_INVALID").buttonDisabled).toBe(true);
	});

	it("shows invalid URL message", () => {
		expect(getCloneUIState("BLOCKED_INVALID").errorMessage).toBeTruthy();
	});
});
