import { useMemo } from 'react';
import { ShiftDef } from '../types';
import { mergeShiftDefs } from '../utils/shiftDefs';

/**
 * Component-side accessor for the workspace's effective shift registry:
 * built-in defaults layered under the facility's custom shifts. Memoized so
 * the returned object is referentially stable per `shifts` reference —
 * safe to use in dependency arrays.
 */
export function useShiftDefs(shifts?: { [code: string]: ShiftDef }): { [code: string]: ShiftDef } {
  return useMemo(() => mergeShiftDefs(shifts), [shifts]);
}
