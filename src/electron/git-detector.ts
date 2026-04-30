/**
 * src/electron/git-detector.ts
 *
 * Detects whether a directory is a Git repository and returns the URL of the
 * remote `origin`, if one is configured.
 *
 * Rules:
 *   - Uses only Node.js built-in modules (no third-party packages).
 *   - All errors are caught silently — callers always receive string | null.
 *   - Uses execFile (not exec) to avoid shell interpolation and to support
 *     paths with spaces or special characters (cross-platform safe).
 *   - A hard timeout of 3 000 ms prevents hanging the app on slow/broken envs.
 *   - windowsHide: true suppresses the CMD flash on Windows.
 */

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";

/**
 * Returns the URL of the remote `origin` for the given project directory,
 * or `null` if:
 *   - the directory has no `.git` entry
 *   - there is no remote named `origin`
 *   - `git` is not available on PATH
 *   - any other error occurs
 *
 * Never throws. Always resolves.
 */
export async function detectGitRemoteOrigin(
	projectDir: string,
): Promise<string | null> {
	try {
		// 1. Fast check: does a .git entry exist at the project root?
		//    Works for both regular repos (.git/ directory) and worktrees (.git file).
		const gitEntry = join(projectDir, ".git");
		if (!existsSync(gitEntry)) {
			return null;
		}

		// 2. Ask git for the URL of the remote named "origin".
		return await new Promise<string | null>((resolve) => {
			execFile(
				"git",
				["remote", "get-url", "origin"],
				{
					cwd: projectDir,
					timeout: 3000, // hard cap — never blocks more than 3 s
					windowsHide: true, // no CMD flash on Windows
				},
				(error, stdout) => {
					if (error || !stdout.trim()) {
						resolve(null);
						return;
					}
					resolve(stdout.trim());
				},
			);
		});
	} catch {
		// Unexpected synchronous error (e.g. existsSync throws) — stay silent.
		return null;
	}
}
