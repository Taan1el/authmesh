import { emptyPolicy, equalPolicies, formatIssue, parsePolicyValue, policyToFile, type Policy } from '../../../shared/policy-file.js';
import {
  clearWorkspace,
  loadMode,
  loadWorkspace,
  saveMode,
  saveWorkspace,
  SavedWorkspaceError,
  subscribeToOtherTabs,
  WorkspaceConflictError,
  type WorkspaceMode,
} from './workspace.js';

export type { WorkspaceMode } from './workspace.js';

/**
 * The saved shape of the workspace: the policy being edited, and `backup`,
 * the baseline: the last version that left the browser as a file (exported,
 * or read from an imported file), or the policy the workspace started from.
 * The two differing is what the backup reminder shows.
 */
interface StoredWorkspace {
  version: 1;
  policy: unknown;
  backup: unknown;
}

export interface WorkspaceState {
  ready: boolean;
  mode: WorkspaceMode;
  /** Null until the person starts a workspace by importing a file or starting from the sample policy. */
  policy: Policy | null;
  backup: Policy | null;
  /** True while the policy differs from the last backup. */
  unbacked: boolean;
  /** Set when another tab saved the workspace and this tab picked up the change. */
  notice: string;
}

let state: WorkspaceState = { ready: false, mode: 'sample', policy: null, backup: null, unbacked: false, notice: '' };
let revision = 0;
let ready: Promise<void> | undefined;
let stopListening: (() => void) | undefined;
const listeners = new Set<() => void>();

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A new object whenever anything changes, so it can be used with useSyncExternalStore. */
export function workspaceState(): WorkspaceState { return state; }

function publish(patch: Partial<WorkspaceState>): void {
  const next = { ...state, ...patch };
  next.unbacked = next.policy !== null && !equalPolicies(next.policy, next.backup ?? emptyPolicy());
  state = next;
  listeners.forEach((listener) => listener());
}

function unreadable(detail: string): SavedWorkspaceError {
  return new SavedWorkspaceError(`The saved workspace in this browser cannot be read (${detail}). Clear it to start again, or import a policy file to replace it.`);
}

function restorePolicy(value: unknown, label: string): Policy {
  const result = parsePolicyValue(value);
  if (!result.ok) throw unreadable(`${label}: ${formatIssue(result.issues[0])}`);
  return result.policy;
}

function restore(saved: StoredWorkspace): { policy: Policy; backup: Policy | null } {
  if (!saved || saved.version !== 1) {
    throw new SavedWorkspaceError('The saved workspace in this browser has an unsupported format. Clear it to start again, or import a policy file to replace it.');
  }
  const policy = restorePolicy(saved.policy, 'policy');
  return { policy, backup: saved.backup === null || saved.backup === undefined ? null : restorePolicy(saved.backup, 'backup') };
}

function toStored(policy: Policy, backup: Policy | null): StoredWorkspace {
  return { version: 1, policy: policyToFile(policy), backup: backup ? policyToFile(backup) : null };
}

async function readAll(): Promise<void> {
  const [mode, saved] = await Promise.all([loadMode(), loadWorkspace<StoredWorkspace>()]);
  if (!saved) {
    revision = 0;
    publish({ ready: true, mode, policy: null, backup: null });
    return;
  }
  const restored = restore(saved.data);
  revision = saved.revision;
  publish({ ready: true, mode, policy: restored.policy, backup: restored.backup });
}

/** Another tab saved the workspace: take its version. Edits made here are already saved, so none are lost. */
async function followOtherTab(): Promise<void> {
  try {
    const before = revision;
    await readAll();
    if (revision !== before) publish({ notice: 'Another tab changed this workspace. This tab now shows the latest saved version.' });
  } catch {
    // The next explicit read reports the problem.
  }
}

export function initializeWorkspace(): Promise<void> {
  ready ??= (async () => {
    await readAll();
    stopListening ??= subscribeToOtherTabs(() => { void followOtherTab(); });
  })().catch((error: unknown) => { ready = undefined; throw error; });
  return ready;
}

export function dismissNotice(): void {
  if (state.notice) publish({ notice: '' });
}

export async function chooseWorkspaceMode(next: WorkspaceMode): Promise<void> {
  await initializeWorkspace();
  await saveMode(next);
  publish({ mode: next, notice: '' });
}

/**
 * Starts or replaces the workspace. `backup` is the baseline: the imported file,
 * or the policy the workspace started from, since both can be recreated. Null
 * means nothing is recorded as safe yet.
 */
export async function replaceWorkspace(policy: Policy, backup: Policy | null): Promise<void> {
  // An explicit import or restart can replace an unreadable saved workspace.
  await initializeWorkspace().catch(() => undefined);
  revision = await saveWorkspace(toStored(policy, backup), { mode: 'workspace' });
  ready = Promise.resolve();
  publish({ ready: true, mode: 'workspace', policy, backup, notice: '' });
}

async function conflictFallback(error: unknown): Promise<never> {
  if (error instanceof WorkspaceConflictError) {
    try { await readAll(); } catch { /* the error below is the one to show */ }
  }
  throw error;
}

/**
 * Applies a change to the latest policy and saves it. The save is refused if
 * another tab saved first; this tab then shows the latest version and the
 * error says the change was not saved.
 */
export async function updatePolicy(change: (current: Policy) => Policy): Promise<void> {
  await initializeWorkspace();
  const current = state.policy;
  if (!current) throw new Error('There is no workspace yet. Import a policy file or start from the sample policy first.');
  const next = change(current);
  try {
    revision = await saveWorkspace(toStored(next, state.backup), { expectedRevision: revision });
  } catch (error) {
    return conflictFallback(error);
  }
  publish({ policy: next });
}

/** Records that the current policy was written to a file, so the backup reminder goes away. */
export async function markBackedUp(): Promise<void> {
  await initializeWorkspace();
  const current = state.policy;
  if (!current) return;
  try {
    revision = await saveWorkspace(toStored(current, current), { expectedRevision: revision });
  } catch (error) {
    return conflictFallback(error);
  }
  publish({ backup: current });
}

export async function removeWorkspace(): Promise<void> {
  // A workspace that cannot be read must still be possible to clear.
  await initializeWorkspace().catch(() => undefined);
  revision = await clearWorkspace();
  ready = Promise.resolve();
  publish({ ready: true, policy: null, backup: null, notice: '' });
}

export function startEmptyPolicy(): Promise<void> {
  const policy = emptyPolicy();
  return replaceWorkspace(policy, policy);
}

/** Test helper: stops listening to other tabs. */
export function stopWorkspaceListening(): void {
  stopListening?.();
  stopListening = undefined;
}
