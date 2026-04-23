---
# 🧠 Plan: Clone Repository Visibility Flow

## 🎯 Objective
Implement a restriction flow for repository cloning: public repositories from any platform are allowed; private repositories are only allowed from GitHub. For private repos from GitLab, Bitbucket, or unknown providers, display a clear message and disable the clone button.

---

## 🧩 Context

### Stack
- React 19 + TypeScript + Vite + Electron
- State management: Zustand 5
- IPC communication: Electron preload bridge

### Relevant Files
| File | Role |
|---|---|
| `src/ui/components/CloneFromGitModal.tsx` | Main clone modal — UI entry point |
| `src/ui/utils/repoVisibility.ts` | Detects repo visibility and platform via GitHub API proxy |
| `src/ui/components/RepoVisibilityBadge.tsx` | Visual badge for visibility state |
| `src/electron/ipc-handlers.ts` | Executes `git clone` via spawn — no platform restrictions |
| `src/electron/bridge.types.ts` | IPC DTOs: `CloneRepositoryRequest`, `GitHubFetchRequest` |

### Existing Types
```typescript
type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown"

type RepoVisibilityResult =
  | 'public' | 'private' | 'not_found'
  | 'unknown_provider' | 'ssh_url'
  | 'network_error' | 'invalid_url'
```

### Current Limitation
Only GitHub is queryable via the IPC proxy (`api.github.com`). GitLab and Bitbucket return `unknown_provider` — visibility cannot be confirmed for those platforms.

---

## 🧭 Strategy
Centralize the "is cloning allowed?" logic in a pure utility function (`clonePermission.ts`) derived from `provider + visibility`. The modal consumes this function reactively. **No IPC changes required** — restriction is 100% frontend.

---

## 🚀 Phases

### 🔹 Phase 1: Create Permission Logic
**Description:** Create a new pure utility that maps `(provider, visibility)` → `ClonePermission` → `CloneUIState`.

**File to create:** `src/ui/utils/clonePermission.ts`

**Permission mapping:**
| visibility | provider | ClonePermission |
|---|---|---|
| `public` | any | `ALLOWED` |
| `private` | `github` | `ALLOWED` |
| `private` | non-github | `BLOCKED_PRIVATE_NON_GITHUB` |
| `unknown_provider` | any | `INDETERMINATE` |
| `ssh_url` | any | `INDETERMINATE` |
| `network_error` | any | `INDETERMINATE` |
| `not_found` | any | `BLOCKED_NOT_FOUND` |
| `invalid_url` | any | `BLOCKED_INVALID` |
| `null` | any | `PENDING` |

**UI State mapping:**
| ClonePermission | buttonDisabled | errorMessage |
|---|---|---|
| `ALLOWED` | `false` | `null` |
| `BLOCKED_PRIVATE_NON_GITHUB` | `true` | `'Currently, only GitHub repositories are supported for private repository cloning.'` |
| `BLOCKED_NOT_FOUND` | `true` | `'Repository not found. Check the URL and try again.'` |
| `BLOCKED_INVALID` | `true` | `'Invalid repository URL.'` |
| `INDETERMINATE` | `false` | `null` (show badge warning only) |
| `PENDING` | `false` | `null` |

**Tasks:**
- **Task:** Define `ClonePermission` union type and `CloneUIState` interface
  - **Assigned to:** design-code
- **Task:** Implement `getClonePermission(provider, visibility): ClonePermission`
  - **Assigned to:** design-code
- **Task:** Implement `getCloneUIState(permission): CloneUIState`
  - **Assigned to:** design-code

---

### 🔹 Phase 2: Modify CloneFromGitModal
**Description:** Consume the new permission logic in the modal to control button state and error message rendering.

**File to modify:** `src/ui/components/CloneFromGitModal.tsx`

**Tasks:**
- **Task:** Import and call `getClonePermission` + `getCloneUIState` using `provider` and `visibility` from Zustand store
  - **Assigned to:** design-code
  - **Dependencies:** Phase 1 complete
- **Task:** Render `errorMessage` below the URL input field (conditionally, only when non-null)
  - **Assigned to:** design-code
  - **UI spec:** `<p className="text-red-500 text-sm mt-1">{errorMessage}</p>`
- **Task:** Pass `buttonDisabled || isCloning` to the clone button's `disabled` prop
  - **Assigned to:** design-code
- **Task:** Reset `visibility` and `provider` in Zustand store on URL `onChange` (prevent stale state)
  - **Assigned to:** design-code

---

### 🔹 Phase 3: Verify Existing Files (No Changes Expected)
**Description:** Confirm that existing files need no modifications.

**Tasks:**
- **Task:** Verify `repoVisibility.ts` exports `GitProvider` and `RepoVisibilityResult` types publicly
  - **Assigned to:** explorer
- **Task:** Confirm `RepoVisibilityBadge.tsx` does not duplicate the `BLOCKED_PRIVATE_NON_GITHUB` message
  - **Assigned to:** explorer
  - **Note:** If badge shows a conflicting message for `unknown_provider` when the error message is already visible, optionally suppress the badge in that case.
- **Task:** Confirm `ipc-handlers.ts` requires no changes (restriction is frontend-only)
  - **Assigned to:** explorer

---

## ⚠️ Edge Cases

| Scenario | Expected Behavior |
|---|---|
| SSH URL (`git@github.com:...`) | `INDETERMINATE` → button enabled, badge warning shown |
| URL changes after detection | Reset to `PENDING` immediately on `onChange` — no stale state |
| `unknown_provider` (GitLab/Bitbucket without API) | `INDETERMINATE` → do not block (visibility unconfirmed) |
| `network_error` during detection | `INDETERMINATE` → do not block, show badge warning |
| Private GitHub repo | `ALLOWED` → normal clone flow |
| Private GitLab/Bitbucket repo | `BLOCKED_PRIVATE_NON_GITHUB` → message shown, button disabled |
| Empty URL | `PENDING` → no message, button in default state |
| `not_found` on GitHub | `BLOCKED_NOT_FOUND` → may be private without auth, generic message |
| GitLab subgroup URL (`/group/sub/repo`) | `parseRepoUrl` returns null → `invalid_url` → `BLOCKED_INVALID` |

---

## 🔮 Extensibility

When GitLab or Bitbucket private repo support is added:

1. Update `repoVisibility.ts` to query GitLab/Bitbucket APIs (returns `'private'` instead of `'unknown_provider'`)
2. Update the `supportedPrivateProviders` list in `clonePermission.ts`:

```typescript
// Before (GitHub only):
case 'private':
  return provider === 'github' ? 'ALLOWED' : 'BLOCKED_PRIVATE_NON_GITHUB'

// After (add GitLab):
const supportedPrivate: GitProvider[] = ['github', 'gitlab']
return supportedPrivate.includes(provider!) ? 'ALLOWED' : 'BLOCKED_PRIVATE_NON_GITHUB'
```

3. No changes needed in `CloneFromGitModal.tsx` or IPC handlers.

---

## 📝 Notes

- **Separation of concerns:**
  - `repoVisibility.ts` → detects what the repo IS
  - `clonePermission.ts` → decides what to DO with that info
  - `CloneFromGitModal.tsx` → only consumes and renders
- **No IPC changes required** — `git clone` itself has no platform restrictions; the restriction is purely a UI/UX decision.
- **`INDETERMINATE` is intentionally permissive** — when visibility cannot be confirmed (SSH, network error, unknown provider), we do not block the user. The badge provides a soft warning.
- The exact error message for `BLOCKED_PRIVATE_NON_GITHUB` is fixed and must not be translated or altered: `'Currently, only GitHub repositories are supported for private repository cloning.'`

---

## 📁 Files Summary

| File | Action | Description |
|---|---|---|
| `src/ui/utils/clonePermission.ts` | **CREATE** | Pure permission logic |
| `src/ui/components/CloneFromGitModal.tsx` | **MODIFY** | Consume permission, render error, disable button, reset on change |
| `src/ui/utils/repoVisibility.ts` | **VERIFY** | Ensure types are exported |
| `src/ui/components/RepoVisibilityBadge.tsx` | **VERIFY / OPTIONAL** | Avoid duplicate messages |
| `src/electron/ipc-handlers.ts` | **NO CHANGES** | Restriction is frontend-only |

---

*Plan generated: 2026-04-23*
*Scope: agentsFlow — Clone Repository Visibility Flow*

---
