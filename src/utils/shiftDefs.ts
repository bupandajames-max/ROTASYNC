import { ShiftDef } from '../types';
import { SHIFTS } from '../data/initialData';

/**
 * The one place that layers a workspace's own configured shifts (Settings →
 * Shift Planner) over the built-in defaults. Every shift/leave-code lookup
 * must go through this merge — a component that reads bare SHIFTS silently
 * misjudges any custom code (wrong hours for overtime math, custom leave
 * types treated as plain absence). That exact bug shipped twice before this
 * helper existed.
 */
export const mergeShiftDefs = (shifts?: { [code: string]: ShiftDef }): { [code: string]: ShiftDef } =>
  ({ ...SHIFTS, ...(shifts || {}) });
