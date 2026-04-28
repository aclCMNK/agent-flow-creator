import { useCallback, useEffect, useReducer } from "react";
import type { GitChangedFile, GitOperationError } from "../../electron/bridge.types.ts";

interface GitChangesState {
	currentBranch: string;
	files: GitChangedFile[];
	stagedCount: number;
	unstagedCount: number;
	commitMessage: string;
	commitDescription: string;
	isLoadingStatus: boolean;
	isCommitting: boolean;
	statusError: string | null;
	commitError: string | null;
	lastCommitSuccess: string | null;
}

type GitChangesAction =
	| { type: "LOAD_STATUS_START" }
	| {
			type: "LOAD_STATUS_SUCCESS";
			currentBranch: string;
			files: GitChangedFile[];
			stagedCount: number;
			unstagedCount: number;
	  }
	| { type: "LOAD_STATUS_ERROR"; error: string }
	| { type: "SET_COMMIT_MESSAGE"; message: string }
	| { type: "SET_COMMIT_DESCRIPTION"; description: string }
	| { type: "COMMIT_START" }
	| { type: "COMMIT_SUCCESS"; commitHash: string }
	| { type: "COMMIT_ERROR"; error: string }
	| { type: "CLEAR_COMMIT_FEEDBACK" }
	| { type: "RESET_FORM" };

const initialState: GitChangesState = {
	currentBranch: "",
	files: [],
	stagedCount: 0,
	unstagedCount: 0,
	commitMessage: "",
	commitDescription: "",
	isLoadingStatus: false,
	isCommitting: false,
	statusError: null,
	commitError: null,
	lastCommitSuccess: null,
};

function reducer(state: GitChangesState, action: GitChangesAction): GitChangesState {
	switch (action.type) {
		case "LOAD_STATUS_START":
			return {
				...state,
				isLoadingStatus: true,
				statusError: null,
			};
		case "LOAD_STATUS_SUCCESS":
			return {
				...state,
				isLoadingStatus: false,
				statusError: null,
				currentBranch: action.currentBranch,
				files: action.files,
				stagedCount: action.stagedCount,
				unstagedCount: action.unstagedCount,
			};
		case "LOAD_STATUS_ERROR":
			return {
				...state,
				isLoadingStatus: false,
				statusError: action.error,
			};
		case "SET_COMMIT_MESSAGE":
			return {
				...state,
				commitMessage: action.message,
			};
		case "SET_COMMIT_DESCRIPTION":
			return {
				...state,
				commitDescription: action.description,
			};
		case "COMMIT_START":
			return {
				...state,
				isCommitting: true,
				commitError: null,
				lastCommitSuccess: null,
			};
		case "COMMIT_SUCCESS":
			return {
				...state,
				isCommitting: false,
				commitError: null,
				lastCommitSuccess: action.commitHash,
			};
		case "COMMIT_ERROR":
			return {
				...state,
				isCommitting: false,
				commitError: action.error,
			};
		case "CLEAR_COMMIT_FEEDBACK":
			return {
				...state,
				commitError: null,
				lastCommitSuccess: null,
			};
		case "RESET_FORM":
			return {
				...state,
				commitMessage: "",
				commitDescription: "",
			};
		default:
			return state;
	}
}

function mapGitErrorToMessage(error: GitOperationError): string {
	switch (error.code) {
		case "E_NOT_A_GIT_REPO":
			return "This directory is not a Git repository.";
		case "E_NOTHING_TO_COMMIT":
			return "Nothing to commit. Working tree is clean.";
		case "E_EMPTY_COMMIT_MSG":
			return "Commit message cannot be empty.";
		case "E_GIT_NOT_FOUND":
			return "Git is not installed or not found in PATH.";
		case "E_TIMEOUT":
			return "Git operation timed out. Try again.";
		default:
			return error.message || "An unexpected Git error occurred.";
	}
}

function getBridge() {
	if (
		typeof window !== "undefined" &&
		typeof window.agentsFlow !== "undefined"
	) {
		return window.agentsFlow;
	}
	return null;
}

export function useGitChanges(projectDir: string | null) {
	const [state, dispatch] = useReducer(reducer, initialState);

	const loadStatus = useCallback(async () => {
		if (!projectDir) return;
		const bridge = getBridge();
		if (!bridge) {
			dispatch({
				type: "LOAD_STATUS_ERROR",
				error: "Electron bridge unavailable.",
			});
			return;
		}

		dispatch({ type: "LOAD_STATUS_START" });
		try {
			const result = await bridge.gitGetStatus({ projectDir });
			if (!result.ok) {
				dispatch({
					type: "LOAD_STATUS_ERROR",
					error: mapGitErrorToMessage(result),
				});
				return;
			}
			dispatch({
				type: "LOAD_STATUS_SUCCESS",
				currentBranch: result.currentBranch,
				files: result.files,
				stagedCount: result.stagedCount,
				unstagedCount: result.unstagedCount,
			});
		} catch {
			dispatch({
				type: "LOAD_STATUS_ERROR",
				error: "Unexpected error loading status.",
			});
		}
	}, [projectDir]);

	const setCommitMessage = useCallback((message: string) => {
		dispatch({ type: "SET_COMMIT_MESSAGE", message });
	}, []);

	const setCommitDescription = useCallback((description: string) => {
		dispatch({ type: "SET_COMMIT_DESCRIPTION", description });
	}, []);

	const addAndCommit = useCallback(async () => {
		if (!projectDir) return;
		const bridge = getBridge();
		if (!bridge) {
			dispatch({
				type: "COMMIT_ERROR",
				error: "Electron bridge unavailable.",
			});
			return;
		}

		const message = state.commitMessage;
		const trimmedMessage = message.trim();
		if (!trimmedMessage) {
			dispatch({
				type: "COMMIT_ERROR",
				error: "Commit message cannot be empty.",
			});
			return;
		}

		dispatch({ type: "COMMIT_START" });
		try {
			const description = state.commitDescription;
			const result = await bridge.gitAddAndCommit({
				projectDir,
				message: trimmedMessage,
				description: description.trim().length > 0 ? description : undefined,
			});

			if (!result.ok) {
				dispatch({
					type: "COMMIT_ERROR",
					error: mapGitErrorToMessage(result),
				});
				return;
			}

			dispatch({ type: "COMMIT_SUCCESS", commitHash: result.commitHash });
			dispatch({ type: "RESET_FORM" });
			await loadStatus();
		} catch {
			dispatch({
				type: "COMMIT_ERROR",
				error: "Unexpected error during commit.",
			});
		}
	}, [projectDir, state.commitMessage, state.commitDescription, loadStatus]);

	const clearFeedback = useCallback(() => {
		dispatch({ type: "CLEAR_COMMIT_FEEDBACK" });
	}, []);

	useEffect(() => {
		if (!projectDir) return;
		void loadStatus();
	}, [projectDir, loadStatus]);

	return {
		state,
		loadStatus,
		setCommitMessage,
		setCommitDescription,
		addAndCommit,
		clearFeedback,
	};
}
