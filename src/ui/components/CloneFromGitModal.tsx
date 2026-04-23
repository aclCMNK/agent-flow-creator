/**
 * src/ui/components/CloneFromGitModal.tsx
 *
 * Modal dialog for cloning a project from a Git repository.
 *
 * Fields:
 *   1. Repository URL  — free text; validated for Git URL format
 *   2. Repo name       — read-only, auto-derived from the URL
 *   3. Directory       — native folder picker (starts at home dir)
 *
 * Buttons:
 *   - Cancel  → closes modal, resets form (disabled while cloning)
 *   - Clone   → enabled only when URL is valid AND a directory is selected
 *
 * Clone operation states: idle → cloning → success | error
 *
 * Reuses the shared modal CSS classes (.modal-backdrop, .modal, .modal__*,
 * .form-field__*, .btn) established by NewProjectModal.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { validateGitUrl, isValidGitUrl } from "../utils/gitUrlUtils.ts";
import type { CloneRepositoryResult } from "../../electron/bridge.types.ts";
import {
	detectRepoVisibility,
	parseRepoUrl,
	type GitProvider,
	type RepoVisibility,
	type VisibilityStatus,
} from "../utils/repoVisibility.ts";
import { RepoVisibilityBadge } from "./RepoVisibilityBadge.tsx";
import {
	getClonePermission,
	getCloneUIState,
} from "../utils/clonePermission.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derives a repository name from a Git URL.
 * Strips trailing ".git" and returns the last path segment.
 * Returns an empty string if the URL is blank or unparseable.
 */
function deriveRepoName(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) return "";
	const normalized = trimmed.replace(/\/+$/, "");
	const lastSegment = normalized.split(/[/:]/g).pop() ?? "";
	return lastSegment.replace(/\.git$/i, "");
}

/**
 * Returns the home directory from the Electron context bridge,
 * or "/" as a safe fallback.
 */
function getHomeDir(): string {
	try {
		return (
			(window as unknown as { appPaths?: { home?: string } }).appPaths?.home ??
			"/"
		);
	} catch {
		return "/";
	}
}

/**
 * Returns the agentsFlow bridge if available, or undefined.
 */
function getBridge() {
	try {
		return (
			window as unknown as {
				agentsFlow?: {
					openFolderDialog?: () => Promise<string | null>;
					cloneRepository?: (req: {
						url: string;
						destDir: string;
						repoName?: string;
					}) => Promise<CloneRepositoryResult>;
				};
			}
		).agentsFlow;
	} catch {
		return undefined;
	}
}

// ── Types ──────────────────────────────────────────────────────────────────

type ClonePhase = "idle" | "cloning" | "success" | "error";

// ── Props ──────────────────────────────────────────────────────────────────

interface CloneFromGitModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Called with the cloned directory path on successful clone */
	onCloned?: (clonedPath: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CloneFromGitModal({
	isOpen,
	onClose,
	onCloned,
}: CloneFromGitModalProps) {
	// ── Form state ─────────────────────────────────────────────────────────
	const [repoUrl, setRepoUrl] = useState("");
	const [selectedDir, setSelectedDir] = useState<string | null>(null);

	// ── Validation state ───────────────────────────────────────────────────
	/** Whether the URL field has been touched (to delay showing errors) */
	const [urlTouched, setUrlTouched] = useState(false);
	const urlValidation = validateGitUrl(repoUrl);

	// ── Visibility detection state ─────────────────────────────────────────
	const [visibility, setVisibility] = useState<VisibilityStatus>("idle");
	/** Provider detected from the URL — used by clonePermission logic */
	const [provider, setProvider] = useState<GitProvider | null>(null);
	/** Raw RepoVisibility result (excluding transient UI states) for permission logic */
	const [repoVisibility, setRepoVisibility] = useState<RepoVisibility | null>(null);

	/** Tracks component mounted state to avoid setState after unmount */
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	/**
	 * Monotonically-increasing counter used to detect stale async responses.
	 * Each time a new visibility check is started, the counter is incremented.
	 * When the async result arrives, it is discarded if the counter has moved on.
	 */
	const visibilityRequestIdRef = useRef(0);

	// ── Clone operation state ──────────────────────────────────────────────
	const [phase, setPhase] = useState<ClonePhase>("idle");
	const [cloneError, setCloneError] = useState<string | null>(null);
	const [clonedPath, setClonedPath] = useState<string | null>(null);

	// ── Derived ────────────────────────────────────────────────────────────
	const repoName = deriveRepoName(repoUrl);
	const isCloning = phase === "cloning";
	/** True while the visibility check is in progress — blocks UI to prevent race conditions */
	const isCheckingVisibility = visibility === "checking";

	// ── Permission / UI state ──────────────────────────────────────────────
	const clonePermission = getClonePermission(provider, repoVisibility);
	const { buttonDisabled, errorMessage } = getCloneUIState(clonePermission);

	/**
	 * Clone button is enabled when:
	 *   - URL is syntactically valid
	 *   - A destination directory is selected
	 *   - No clone operation is already in progress
	 *   - Visibility check is not running (prevents race conditions)
	 *   - Visibility has been checked (not idle with a valid URL) — prevents
	 *     bypass via submit without triggering onBlur first
	 *   - Permission logic does not block the action
	 */
	const visibilityPending = urlValidation.valid && visibility === "idle";
	const canClone =
		urlValidation.valid &&
		selectedDir !== null &&
		!isCloning &&
		!isCheckingVisibility &&
		!visibilityPending &&
		!buttonDisabled;

	// ── Refs ───────────────────────────────────────────────────────────────
	const urlInputRef = useRef<HTMLInputElement>(null);

	// ── Reset form when modal opens ────────────────────────────────────────
	useEffect(() => {
		if (isOpen) {
			// Invalidate any in-flight visibility check
			visibilityRequestIdRef.current += 1;
			setRepoUrl("");
			setSelectedDir(null);
			setUrlTouched(false);
			setVisibility("idle");
			setProvider(null);
			setRepoVisibility(null);
			setPhase("idle");
			setCloneError(null);
			setClonedPath(null);
			setTimeout(() => urlInputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// ── Escape key closes modal (unless cloning) ───────────────────────────
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isCloning) onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, isCloning, onClose]);

	// ── Backdrop click closes modal (unless cloning) ───────────────────────
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (e.target === e.currentTarget && !isCloning) onClose();
		},
		[isCloning, onClose],
	);

	// ── Directory picker ───────────────────────────────────────────────────
	const handleChooseDir = useCallback(async () => {
		try {
			const bridge = getBridge();
			if (!bridge?.openFolderDialog) return;
			const dir = await bridge.openFolderDialog();
			if (dir) setSelectedDir(dir);
		} catch {
			// No-op — picker was cancelled or bridge unavailable
		}
	}, []);

	// ── URL field change ───────────────────────────────────────────────────
	const handleUrlChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setRepoUrl(e.target.value);
			// Invalidate any in-flight visibility check so stale results are ignored
			visibilityRequestIdRef.current += 1;
			// Reset visibility, provider and permission state on every keystroke
			// to prevent stale state from a previous detection
			setVisibility("idle");
			setProvider(null);
			setRepoVisibility(null);
			// Reset clone error when user edits the URL
			if (phase === "error") {
				setPhase("idle");
				setCloneError(null);
			}
		},
		[phase],
	);

	/**
	 * Core visibility detection logic — shared between blur and submit.
	 * Accepts the URL to check explicitly to avoid closure staleness.
	 * Returns the RepoVisibility result, or null if aborted (URL changed / unmounted).
	 *
	 * Race-condition protection: increments the request counter before the
	 * async call and discards the result if the counter has changed by the
	 * time the promise resolves (i.e. the user changed the URL mid-flight).
	 */
	const runVisibilityCheck = useCallback(async (urlToCheck: string): Promise<import("../utils/repoVisibility.ts").RepoVisibility | "invalid" | null> => {
		// Skip detection if URL is empty or syntactically invalid
		if (!urlToCheck.trim() || !isValidGitUrl(urlToCheck)) {
			setVisibility("idle");
			setProvider(null);
			setRepoVisibility(null);
			return "invalid";
		}

		// Capture and increment the request ID for this check
		visibilityRequestIdRef.current += 1;
		const thisRequestId = visibilityRequestIdRef.current;

		// Extract provider from the URL before the async call
		const parsed = parseRepoUrl(urlToCheck);
		const detectedProvider = parsed?.provider ?? null;
		setProvider(detectedProvider);
		setVisibility("checking");

		const result = await detectRepoVisibility(urlToCheck);

		// Guard: ignore result if modal was closed or URL changed during the async call
		if (!mountedRef.current) return null;
		if (visibilityRequestIdRef.current !== thisRequestId) return null;

		setRepoVisibility(result);
		// "not_found" (404) is treated as "private" in the badge UI
		setVisibility(result === "not_found" ? "private" : result);
		return result;
	}, []);

	// ── URL field blur — trigger visibility detection ──────────────────────
	const handleUrlBlur = useCallback(async () => {
		setUrlTouched(true);
		await runVisibilityCheck(repoUrl);
	}, [repoUrl, runVisibilityCheck]);

	// ── Done (post-success) ────────────────────────────────────────────────
	const handleDone = useCallback(() => {
		if (clonedPath && onCloned) {
			onCloned(clonedPath);
		}
		onClose();
	}, [clonedPath, onCloned, onClose]);

	// ── Clone ──────────────────────────────────────────────────────────────
	const handleClone = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			setUrlTouched(true);

			// If visibility has not been checked yet (e.g. user never blurred the
			// URL field), run the check now before proceeding. This prevents bypass
			// via keyboard submit (Enter) without triggering onBlur.
			let effectiveVisibilityResult = repoVisibility;
			let effectiveProvider = provider;
			if (urlValidation.valid && visibility === "idle") {
				const parsed = parseRepoUrl(repoUrl);
				effectiveProvider = parsed?.provider ?? null;
				const checkResult = await runVisibilityCheck(repoUrl);
				// Aborted (URL changed or modal closed mid-check) — bail out
				if (checkResult === null) return;
				// Invalid URL — bail out (syntax error, not a real URL)
				if (checkResult === "invalid") return;
				effectiveVisibilityResult = checkResult;
			}

			// Re-derive permission from the freshly-obtained visibility result
			// (avoids relying on stale React state after the async check above)
			const freshPermission = getClonePermission(effectiveProvider, effectiveVisibilityResult);
			const { buttonDisabled: freshButtonDisabled } = getCloneUIState(freshPermission);

			const canCloneNow =
				urlValidation.valid &&
				selectedDir !== null &&
				!isCloning &&
				!freshButtonDisabled;

			if (!canCloneNow || !selectedDir) return;

			const bridge = getBridge();
			if (!bridge?.cloneRepository) {
				setPhase("error");
				setCloneError(
					"Git clone is not available in this environment. " +
						"Make sure the Electron bridge is loaded.",
				);
				return;
			}

			setPhase("cloning");
			setCloneError(null);

			try {
				const result = await bridge.cloneRepository({
					url: repoUrl.trim(),
					destDir: selectedDir,
					repoName: repoName || undefined,
				});

				if (result.success && result.clonedPath) {
					setPhase("success");
					setClonedPath(result.clonedPath);
				} else {
					setPhase("error");
					setCloneError(
						result.error ?? "An unexpected error occurred during cloning.",
					);
				}
			} catch (err) {
				setPhase("error");
				setCloneError(
					err instanceof Error ? err.message : "An unexpected error occurred.",
				);
			}
		},
		[canClone, selectedDir, repoUrl, repoName, repoVisibility, provider, urlValidation.valid, visibility, isCloning, runVisibilityCheck],
	);

	// ── Render ─────────────────────────────────────────────────────────────
	if (!isOpen) return null;

	/** Show URL format error only after the field has been touched and lost focus */
	const showUrlError =
		urlTouched && repoUrl.trim().length > 0 && !urlValidation.valid;

	return (
		<div
			className="modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-labelledby="clone-git-modal-title"
			onClick={handleBackdropClick}
		>
			<div className="modal" tabIndex={-1}>
				{/* ── Header ──────────────────────────────────────────────── */}
				<header className="modal__header">
					<h2 className="modal__title" id="clone-git-modal-title">
						Clone from Git
					</h2>
					<button
						className="modal__close-btn"
						onClick={onClose}
						aria-label="Close dialog"
						disabled={isCloning}
					>
						✕
					</button>
				</header>

				{/* ── Form ─────────────────────────────────────────────────── */}
				<form className="modal__body" onSubmit={handleClone} noValidate>
					{/* Repository URL */}
					<div className="form-field">
						<label htmlFor="clone-git-url" className="form-field__label">
							Repository URL{" "}
							<span aria-hidden="true" className="form-field__required">
								*
							</span>
						</label>
						<input
							id="clone-git-url"
							ref={urlInputRef}
							type="url"
							className={[
								"form-field__input",
								showUrlError ? "form-field__input--error" : "",
							]
								.join(" ")
								.trim()}
							value={repoUrl}
							onChange={handleUrlChange}
							onBlur={handleUrlBlur}
							placeholder="https://github.com/org/repo.git"
							autoComplete="off"
							spellCheck={false}
						disabled={isCloning || isCheckingVisibility}
						aria-describedby={
							showUrlError ? "clone-git-url-error" : undefined
						}
							aria-invalid={showUrlError ? "true" : undefined}
						/>
						{showUrlError && (
							<span
								id="clone-git-url-error"
								className="form-field__error"
								role="alert"
							>
								{urlValidation.error}
							</span>
						)}
						<RepoVisibilityBadge status={visibility} />
						{errorMessage && (
							<p className="text-red-500 text-sm mt-1" role="alert">
								{errorMessage}
							</p>
						)}
					</div>

					{/* Repo name — read-only, auto-derived */}
					<div className="form-field">
						<label htmlFor="clone-git-name" className="form-field__label">
							Repository Name
						</label>
						<input
							id="clone-git-name"
							type="text"
							className="form-field__input form-field__input--readonly"
							value={repoName}
							readOnly
							aria-readonly="true"
							tabIndex={-1}
							placeholder="Auto-filled from URL"
						/>
						<span className="form-field__hint">
							Auto-filled from the URL. Not editable.
						</span>
					</div>

					{/* Destination directory */}
					<div className="form-field">
						<label className="form-field__label">
							Destination Folder{" "}
							<span aria-hidden="true" className="form-field__required">
								*
							</span>
						</label>
						<p className="form-field__hint">
							The repository will be cloned into a subfolder inside the selected
							location. Starts in your home directory ({getHomeDir()}).
						</p>

						<div className="form-field__dir-row">
							<span
								className="form-field__dir-path"
								title={selectedDir ?? "No folder selected"}
								aria-live="polite"
							>
								{selectedDir ?? (
									<span className="form-field__dir-placeholder">
										No folder selected
									</span>
								)}
							</span>

							<button
								type="button"
								className="btn btn--secondary form-field__dir-btn"
								onClick={handleChooseDir}
						disabled={isCloning || isCheckingVisibility}
							>
								Choose Folder
							</button>
						</div>

						{selectedDir && repoName && (
							<p
								className="form-field__hint form-field__hint--ok"
								aria-live="polite"
							>
								Will clone into:{" "}
								<code>
									{selectedDir}/{repoName}
								</code>
							</p>
						)}
					</div>

					{/* ── Clone status messages ──────────────────────────────── */}

					{phase === "cloning" && (
						<div
							className="form-field__status form-field__status--loading"
							role="status"
							aria-live="polite"
						>
							<span className="form-field__status-spinner" aria-hidden="true" />
							Cloning repository… This may take a moment.
						</div>
					)}

					{phase === "success" && clonedPath && (
						<div
							className="form-field__status form-field__status--success"
							role="status"
							aria-live="polite"
						>
							✓ Repository cloned successfully into <code>{clonedPath}</code>
						</div>
					)}

					{phase === "error" && cloneError && (
						<div
							className="form-field__status form-field__status--error"
							role="alert"
							aria-live="assertive"
						>
							⚠ {cloneError}
						</div>
					)}

					{/* ── Footer ──────────────────────────────────────────────── */}
					<footer className="modal__footer">
						{phase === "success" ? (
							<button
								type="button"
								className="btn btn--primary"
								onClick={handleDone}
							>
								Done
							</button>
						) : (
							<>
								<button
									type="button"
									className="btn btn--ghost"
									onClick={onClose}
						disabled={isCloning || isCheckingVisibility}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="btn btn--primary"
									disabled={!canClone}
								>
									{isCloning ? "Cloning…" : "Clone"}
								</button>
							</>
						)}
					</footer>
				</form>
			</div>
		</div>
	);
}
