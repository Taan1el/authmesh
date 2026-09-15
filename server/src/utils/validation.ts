// Moved to shared/validation.ts so TenantService (also shared) can validate
// input without a dependency on server-only code. Re-exported here so
// existing server imports (controllers) do not need to change.
export { ROLE_NAMES, isValidRoleName, isValidPermissionString, isValidPermissionList, isValidEmail, isNonEmptyString, clampPositiveInt } from '../../../shared/validation.js';
