/**
 * src/ui/components/RepoVisibilityBadge.tsx
 *
 * Displays a color-coded status message indicating whether a Git repository
 * URL has been detected as public, private, or in another non-queryable state.
 *
 * Renders nothing for "idle" and "invalid_url" statuses — those are handled
 * by the URL validation error message already present in the modal.
 */

import type { VisibilityStatus } from "../utils/repoVisibility.ts";

// ── Config ─────────────────────────────────────────────────────────────────

interface VisibilityConfig {
	color: string;
	message: string;
	isSpinner?: boolean;
}

const VISIBILITY_CONFIG: Partial<Record<VisibilityStatus, VisibilityConfig>> = {
	checking: {
		color: "#9ca3af", // neutral gray
		message: "Verificando repositorio…",
		isSpinner: true,
	},
	public: {
		color: "#22c55e", // green-500
		message: "✓ Repositorio público detectado",
	},
	private: {
		color: "#ef4444", // red-500
		message: "✗ Repositorio privado, debes ingresar credenciales",
	},
	not_found: {
		color: "#ef4444", // red-500 — treated same as private
		message: "✗ Repositorio privado, debes ingresar credenciales",
	},
	ssh_url: {
		color: "#f59e0b", // amber-500
		message: "⚠ URL SSH detectada, no se puede verificar visibilidad",
	},
	unknown_provider: {
		color: "#f59e0b", // amber-500
		message:
			"⚠ Solo se puede verificar visibilidad en repositorios de GitHub. GitLab y Bitbucket no están soportados por el proxy IPC.",
	},
	network_error: {
		color: "#f97316", // orange-500
		message:
			"⚠ No se pudo verificar (error de red, timeout o proxy IPC no disponible)",
	},
};

// ── Spinner styles (inline — no external deps) ─────────────────────────────

const SPINNER_STYLE: React.CSSProperties = {
	display: "inline-block",
	width: 10,
	height: 10,
	border: "2px solid currentColor",
	borderTopColor: "transparent",
	borderRadius: "50%",
	animation: "repo-visibility-spin 0.6s linear infinite",
	marginRight: 6,
	verticalAlign: "middle",
};

// ── Props ──────────────────────────────────────────────────────────────────

interface RepoVisibilityBadgeProps {
	status: VisibilityStatus;
}

// ── Component ──────────────────────────────────────────────────────────────

export function RepoVisibilityBadge({ status }: RepoVisibilityBadgeProps) {
	// Do not render anything for terminal/non-visible states
	if (status === "idle" || status === "invalid_url") return null;

	const config = VISIBILITY_CONFIG[status];
	if (!config) return null;

	return (
		<>
			{/* Keyframe injected once — safe to repeat (browser dedupes) */}
			<style>{`
        @keyframes repo-visibility-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

			<div
				role="status"
				aria-live="polite"
				style={{
					color: config.color,
					fontSize: "0.85rem",
					marginTop: 4,
					display: "flex",
					alignItems: "center",
				}}
			>
				{config.isSpinner && <span style={SPINNER_STYLE} aria-hidden="true" />}
				<span>{config.message}</span>
			</div>
		</>
	);
}
