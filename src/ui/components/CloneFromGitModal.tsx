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
import { validateGitUrl } from "../utils/gitUrlUtils.ts";
import type { CloneRepositoryResult } from "../../electron/bridge.types.ts";

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

	// ── Clone operation state ──────────────────────────────────────────────
	const [phase, setPhase] = useState<ClonePhase>("idle");
	const [cloneError, setCloneError] = useState<string | null>(null);
	const [clonedPath, setClonedPath] = useState<string | null>(null);

	// ── Derived ────────────────────────────────────────────────────────────
	const repoName = deriveRepoName(repoUrl);
	const isCloning = phase === "cloning";

	/**
	 * Clone button is enabled when:
	 *   - URL is syntactically valid
	 *   - A destination directory is selected
	 *   - No clone operation is already in progress
	 */
	const canClone = urlValidation.valid && selectedDir !== null && !isCloning;

	// ── Refs ───────────────────────────────────────────────────────────────
	const urlInputRef = useRef<HTMLInputElement>(null);

	// ── Reset form when modal opens ────────────────────────────────────────
	useEffect(() => {
		if (isOpen) {
			setRepoUrl("");
			setSelectedDir(null);
			setUrlTouched(false);
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
			// Reset clone error when user edits the URL
			if (phase === "error") {
				setPhase("idle");
				setCloneError(null);
			}
		},
		[phase],
	);

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
			if (!canClone || !selectedDir) return;

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
		[canClone, selectedDir, repoUrl, repoName, onCloned],
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
							onBlur={() => setUrlTouched(true)}
							placeholder="https://github.com/org/repo.git"
							autoComplete="off"
							spellCheck={false}
							disabled={isCloning}
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
								disabled={isCloning}
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
									disabled={isCloning}
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
