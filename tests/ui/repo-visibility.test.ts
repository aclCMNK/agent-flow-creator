/**
 * tests/ui/repo-visibility.test.ts
 *
 * Unit tests for src/ui/utils/repoVisibility.ts
 *
 * All tests mock window.agentsFlow.githubFetch — no real network calls are made.
 * The fetch() global is intentionally NOT mocked here; any accidental direct
 * fetch() call from the renderer would fail the test suite (no global fetch in
 * the bun test environment unless explicitly set up).
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
	parseRepoUrl,
	detectRepoVisibility,
} from "../../src/ui/utils/repoVisibility.ts";
import type { GitHubFetchResult } from "../../src/electron/bridge.types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Installs a mock for window.agentsFlow.githubFetch that returns the given result.
 */
function mockGithubFetch(result: GitHubFetchResult) {
	const fn = mock(async () => result);
	(globalThis as unknown as Record<string, unknown>).window = {
		agentsFlow: { githubFetch: fn },
	};
	return fn;
}

/**
 * Removes the window mock after each test.
 */
function clearWindowMock() {
	delete (globalThis as unknown as Record<string, unknown>).window;
}

// ── parseRepoUrl ───────────────────────────────────────────────────────────

describe("parseRepoUrl — provider detection", () => {
	it("detects github.com", () => {
		const r = parseRepoUrl("https://github.com/owner/repo.git");
		expect(r?.provider).toBe("github");
		expect(r?.owner).toBe("owner");
		expect(r?.repo).toBe("repo");
	});

	it("detects gitlab.com", () => {
		const r = parseRepoUrl("https://gitlab.com/owner/repo");
		expect(r?.provider).toBe("gitlab");
	});

	it("detects bitbucket.org", () => {
		const r = parseRepoUrl("https://bitbucket.org/owner/repo");
		expect(r?.provider).toBe("bitbucket");
	});

	it("marks unknown provider for self-hosted", () => {
		const r = parseRepoUrl("https://git.mycompany.com/owner/repo");
		expect(r?.provider).toBe("unknown");
	});

	it("strips .git suffix from repo name", () => {
		const r = parseRepoUrl("https://github.com/org/myrepo.git");
		expect(r?.repo).toBe("myrepo");
	});

	it("returns null for SSH shorthand", () => {
		expect(parseRepoUrl("git@github.com:org/repo.git")).toBeNull();
	});

	it("returns null for ssh:// scheme", () => {
		expect(parseRepoUrl("ssh://git@github.com/org/repo.git")).toBeNull();
	});

	it("returns null for git:// scheme", () => {
		expect(parseRepoUrl("git://github.com/org/repo.git")).toBeNull();
	});

	it("returns null for URL with only one path segment", () => {
		expect(parseRepoUrl("https://github.com/owner")).toBeNull();
	});

	it("returns null for completely invalid string", () => {
		expect(parseRepoUrl("not-a-url")).toBeNull();
	});
});

// ── detectRepoVisibility — proxy IPC flow ──────────────────────────────────

describe("detectRepoVisibility — GitHub via IPC proxy", () => {
	afterEach(clearWindowMock);

	it("returns 'public' when proxy responds with status 200", async () => {
		mockGithubFetch({ success: true, status: 200, body: "{}" });
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("public");
	});

	it("returns 'private' when proxy responds with status 401", async () => {
		mockGithubFetch({ success: false, status: 401, body: "" });
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("private");
	});

	it("returns 'private' when proxy responds with status 403", async () => {
		mockGithubFetch({ success: false, status: 403, body: "" });
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("private");
	});

	it("returns 'not_found' when proxy responds with status 404", async () => {
		mockGithubFetch({ success: false, status: 404, body: "" });
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("not_found");
	});

	it("returns 'network_error' when proxy responds with status 429 (rate limit)", async () => {
		mockGithubFetch({ success: false, status: 429, body: "" });
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("network_error");
	});

	it("returns 'network_error' when proxy returns errorCode NETWORK_ERROR", async () => {
		mockGithubFetch({
			success: false,
			errorCode: "NETWORK_ERROR",
			error: "connection refused",
		});
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("network_error");
	});

	it("returns 'invalid_url' when proxy returns errorCode INVALID_URL", async () => {
		mockGithubFetch({
			success: false,
			errorCode: "INVALID_URL",
			error: "not api.github.com",
		});
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("invalid_url");
	});

	it("passes the optional token to the proxy", async () => {
		const fn = mockGithubFetch({ success: true, status: 200, body: "{}" });
		await detectRepoVisibility("https://github.com/owner/repo", "my-token");
		expect(fn).toHaveBeenCalledTimes(1);
		const callArg = (fn.mock.calls[0] as [{ url: string; token?: string }])[0];
		expect(callArg.token).toBe("my-token");
	});

	it("calls the proxy with the correct api.github.com URL", async () => {
		const fn = mockGithubFetch({ success: true, status: 200, body: "{}" });
		await detectRepoVisibility("https://github.com/myorg/myrepo.git");
		const callArg = (fn.mock.calls[0] as [{ url: string }])[0];
		expect(callArg.url).toBe("https://api.github.com/repos/myorg/myrepo");
	});
});

// ── detectRepoVisibility — non-GitHub providers ────────────────────────────

describe("detectRepoVisibility — non-GitHub providers return unknown_provider", () => {
	afterEach(clearWindowMock);

	it("returns 'unknown_provider' for gitlab.com (no proxy support)", async () => {
		// No mock needed — should short-circuit before calling proxy
		const result = await detectRepoVisibility(
			"https://gitlab.com/owner/repo.git",
		);
		expect(result).toBe("unknown_provider");
	});

	it("returns 'unknown_provider' for bitbucket.org (no proxy support)", async () => {
		const result = await detectRepoVisibility(
			"https://bitbucket.org/owner/repo",
		);
		expect(result).toBe("unknown_provider");
	});

	it("returns 'unknown_provider' for self-hosted GitLab", async () => {
		const result = await detectRepoVisibility(
			"https://git.mycompany.com/owner/repo",
		);
		expect(result).toBe("unknown_provider");
	});
});

// ── detectRepoVisibility — SSH and invalid URLs ────────────────────────────

describe("detectRepoVisibility — SSH and invalid URLs", () => {
	afterEach(clearWindowMock);

	it("returns 'ssh_url' for SSH shorthand", async () => {
		const result = await detectRepoVisibility("git@github.com:org/repo.git");
		expect(result).toBe("ssh_url");
	});

	it("returns 'ssh_url' for ssh:// scheme", async () => {
		const result = await detectRepoVisibility(
			"ssh://git@github.com/org/repo.git",
		);
		expect(result).toBe("ssh_url");
	});

	it("returns 'ssh_url' for git:// scheme", async () => {
		const result = await detectRepoVisibility("git://github.com/org/repo.git");
		expect(result).toBe("ssh_url");
	});

	it("returns 'invalid_url' for a completely malformed string", async () => {
		const result = await detectRepoVisibility("not-a-url-at-all");
		expect(result).toBe("invalid_url");
	});

	it("returns 'invalid_url' for a URL with only one path segment", async () => {
		const result = await detectRepoVisibility("https://github.com/owner");
		expect(result).toBe("invalid_url");
	});
});

// ── detectRepoVisibility — IPC proxy unavailable ───────────────────────────

describe("detectRepoVisibility — proxy not available", () => {
	beforeEach(() => {
		// Ensure window.agentsFlow is NOT set
		clearWindowMock();
	});

	it("returns 'network_error' when window.agentsFlow is undefined", async () => {
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("network_error");
	});

	it("returns 'network_error' when githubFetch is missing from bridge", async () => {
		(globalThis as unknown as Record<string, unknown>).window = {
			agentsFlow: {}, // bridge exists but githubFetch is not exposed
		};
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("network_error");
	});
});

// ── detectRepoVisibility — proxy throws ───────────────────────────────────

describe("detectRepoVisibility — proxy throws exception", () => {
	afterEach(clearWindowMock);

	it("returns 'network_error' when the proxy rejects", async () => {
		const fn = mock(async () => {
			throw new Error("IPC channel closed");
		});
		(globalThis as unknown as Record<string, unknown>).window = {
			agentsFlow: { githubFetch: fn },
		};
		const result = await detectRepoVisibility("https://github.com/owner/repo");
		expect(result).toBe("network_error");
	});
});
