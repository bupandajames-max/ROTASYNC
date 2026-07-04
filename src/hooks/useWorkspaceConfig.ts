import { useEffect, useState } from 'react';
import { dbSetDoc } from '../firebase';
import { facilityKey } from '../utils/storageKeys';
import { SHIFTS, buildDefaultRuleSet, buildDefaultWorkspaceConfig, DEFAULT_TAXONOMY } from '../data/initialData';
import type { RosterRuleSet, ShiftDef, PublicHoliday } from '../types';

// Re-exported (not redefined) so every caller gets one canonical default —
// this file used to keep its own separate copy that had drifted from the
// data/initialData.ts version and was missing organizationName entirely,
// which caused a real type bug once organizationName needed to flow through
// hydration (see useHydration.ts). Single source of truth now.
export { DEFAULT_TAXONOMY };

/**
 * Owns the per-facility, runtime-defined workspace configuration: shifts,
 * terminology (taxonomy), roster rules, task categories, facility types,
 * timezone/region, and public holidays. Everything here answers "how is
 * this workspace configured" — not who's in it or what tasks exist.
 */
export function useWorkspaceConfig(selectedFacilityId: string, isHydrated: boolean, firebaseUser: any) {
  const [shifts, setShifts] = useState<{ [code: string]: ShiftDef }>(SHIFTS);
  const [taxonomy, setTaxonomy] = useState(DEFAULT_TAXONOMY);
  const [ruleSet, setRuleSet] = useState<RosterRuleSet>(buildDefaultRuleSet());
  const [taskCategories, setTaskCategories] = useState<string[]>(() => buildDefaultWorkspaceConfig().taskCategories);
  const [facilityTypes, setFacilityTypes] = useState<string[]>(() => buildDefaultWorkspaceConfig().facilityTypes);
  const [timezoneLabel, setTimezoneLabel] = useState<string>('');
  const [regionPresetId, setRegionPresetId] = useState<string | undefined>(undefined);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);

  // Sync custom taxonomy changes to localStorage. The isHydrated guard is
  // essential: taxonomy initializes to DEFAULT_TAXONOMY, and without the
  // guard this effect fires on mount (once selectedFacilityId resolves) and
  // writes that blank default OVER the stored taxonomy — including the saved
  // organization name — before hydration has had a chance to load the real
  // one. Hydration then reads back the clobbered default, so the org name
  // "disappears" on refresh. Only persist once hydrated (i.e. real user
  // edits), exactly like the config/holidays effects below.
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    localStorage.setItem(facilityKey(selectedFacilityId, 'taxonomy'), JSON.stringify(taxonomy));
  }, [taxonomy, selectedFacilityId, isHydrated]);

  // Persist workspace configuration bundle (ruleset, categories, facility types, regional)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    const cfg = {
      ruleSet,
      taskCategories,
      facilityTypes,
      timezoneLabel,
      regionPresetId,
    };
    try {
      localStorage.setItem(facilityKey(selectedFacilityId, 'config'), JSON.stringify(cfg));
    } catch {}
    if (firebaseUser) {
      dbSetDoc('workspaceConfigs', selectedFacilityId, { id: selectedFacilityId, ...cfg }).catch(() => {});
    }
  }, [ruleSet, taskCategories, facilityTypes, timezoneLabel, regionPresetId, selectedFacilityId, isHydrated, firebaseUser]);

  // Keep holidays persisted per-facility (Regional settings)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    try {
      localStorage.setItem(facilityKey(selectedFacilityId, 'holidays'), JSON.stringify(holidays));
    } catch {}
  }, [holidays, selectedFacilityId, isHydrated]);

  // Same isHydrated guard as taxonomy above: `shifts` initializes to the
  // SHIFTS defaults, so without the guard this effect writes those defaults
  // over the stored custom_shifts on mount, before hydration loads the real
  // set — which is why custom shifts "disappear" after refresh.
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    localStorage.setItem(facilityKey(selectedFacilityId, 'custom_shifts'), JSON.stringify(shifts));
  }, [shifts, selectedFacilityId, isHydrated]);

  return {
    shifts, setShifts,
    taxonomy, setTaxonomy,
    ruleSet, setRuleSet,
    taskCategories, setTaskCategories,
    facilityTypes, setFacilityTypes,
    timezoneLabel, setTimezoneLabel,
    regionPresetId, setRegionPresetId,
    holidays, setHolidays,
  };
}
