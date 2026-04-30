/**
 * tests/ui/clone-from-git-validation.test.ts
 *
 * Unit tests for the Git URL validation helpers in
 * src/ui/utils/gitUrlUtils.ts
 *
 * These are pure-logic tests — no DOM, no React, no Electron.
 */

import { describe, it, expect } from "bun:test";
import {
	validateGitUrl,
	isValidGitUrl,
} from "../../src/ui/utils/gitUrlUtils.ts";

// ── validateGitUrl ─────────────────────────────────────────────────────────

describe("validateGitUrl — valid HTTPS URLs", () => {
	const cases = [
		"https://github.com/org/repo.git",
		"https://github.com/org/repo",
		"https://gitlab.com/group/subgroup/repo.git",
		"https://bitbucket.org/team/repo",
		"https://user:token@github.com/org/private.git",
		"http://192.168.1.100/org/repo.git",
	];

	for (const url of cases) {
		it(`accepts: ${url}`, () => {
			const result = validateGitUrl(url);
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
			expect(["https", "http"]).toContain(result.scheme);
		});
	}
});

describe("validateGitUrl — valid SSH shorthand URLs", () => {
	const cases = [
		"git@github.com:org/repo.git",
		"git@github.com:org/repo",
		"git@gitlab.com:group/subgroup/repo.git",
		"git@bitbucket.org:team/repo.git",
	];

	for (const url of cases) {
		it(`accepts: ${url}`, () => {
			const result = validateGitUrl(url);
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.scheme).toBe("ssh");
		});
	}
});

describe("validateGitUrl — valid git:// protocol URLs", () => {
	const cases = [
		"git://github.com/org/repo.git",
		"git://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git",
	];

	for (const url of cases) {
		it(`accepts: ${url}`, () => {
			const result = validateGitUrl(url);
			expect(result.valid).toBe(true);
			expect(result.scheme).toBe("git");
		});
	}
});

describe("validateGitUrl — valid ssh:// protocol URLs", () => {
	const cases = [
		"ssh://git@github.com/org/repo.git",
		"ssh://git@gitlab.com/group/repo.git",
	];

	for (const url of cases) {
		it(`accepts: ${url}`, () => {
			const result = validateGitUrl(url);
			expect(result.valid).toBe(true);
			expect(result.scheme).toBe("ssh+git");
		});
	}
});

describe("validateGitUrl — invalid / malformed URLs", () => {
	it("returns { valid: false } with no error for empty string", () => {
		const result = validateGitUrl("");
		expect(result.valid).toBe(false);
		expect(result.error).toBeUndefined();
		expect(result.scheme).toBeUndefined();
	});

	it("returns { valid: false } with no error for whitespace-only string", () => {
		const result = validateGitUrl("   ");
		expect(result.valid).toBe(false);
		expect(result.error).toBeUndefined();
	});

	const invalidCases = [
		"not-a-url",
		"just-some-text",
		"ftp://github.com/org/repo",
		"github.com/org/repo",
		"/local/path/to/repo",
		"C:\\Users\\repo",
		"file:///home/user/repo",
		"http://",
		"https://",
	];

	for (const url of invalidCases) {
		it(`rejects: "${url}"`, () => {
			const result = validateGitUrl(url);
			expect(result.valid).toBe(false);
			expect(result.error).toBeTruthy();
			expect(result.scheme).toBeUndefined();
		});
	}
});

describe("validateGitUrl — trims surrounding whitespace", () => {
	it("accepts a valid URL with leading/trailing spaces", () => {
		const result = validateGitUrl("  https://github.com/org/repo.git  ");
		expect(result.valid).toBe(true);
	});

	it("rejects invalid URL even with whitespace trimmed", () => {
		const result = validateGitUrl("  not-a-url  ");
		expect(result.valid).toBe(false);
		expect(result.error).toBeTruthy();
	});
});

// ── isValidGitUrl ──────────────────────────────────────────────────────────

describe("isValidGitUrl", () => {
	it("returns true for a valid HTTPS URL", () => {
		expect(isValidGitUrl("https://github.com/org/repo.git")).toBe(true);
	});

	it("returns true for a valid SSH shorthand URL", () => {
		expect(isValidGitUrl("git@github.com:org/repo.git")).toBe(true);
	});

	it("returns false for an empty string", () => {
		expect(isValidGitUrl("")).toBe(false);
	});

	it("returns false for a malformed URL", () => {
		expect(isValidGitUrl("not-a-url")).toBe(false);
	});
});
