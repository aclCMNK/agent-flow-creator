/**
 * src/ui/components/Permissions/index.ts
 *
 * Public barrel export for the Permissions module.
 */

export { PermissionsModal } from "./PermissionsModal.tsx";
export type { PermissionsModalProps } from "./PermissionsModal.tsx";
export { PERMISSION_VALUES, validateLocalState } from "./PermissionsModal.tsx";
export type { ValidateLocalStateResult } from "./PermissionsModal.tsx";

export {
  filterSkillsForAutocomplete,
  validateSkillEntry,
  validateSkillsSection,
} from "./SkillsPermissions.ts";
export type { LocalSkillEntry, ValidateSkillsSectionResult } from "./SkillsPermissions.ts";
