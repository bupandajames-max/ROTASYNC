import { useEffect, useState } from 'react';
import { dbSetDoc } from '../firebase';
import { facilityKey } from '../utils/storageKeys';
import { SHIFTS, buildDefaultRuleSet, buildDefaultWorkspaceConfig } from '../data/initialData';
import type { RosterRuleSet, ShiftDef, PublicHoliday } from '../types';

export const DEFAULT_TAXONOMY = {
  appName: 'RotaSync',
  workspaceSingular: 'Facility',
  workspacePlural: 'Facilities',
  memberSingular: 'Staff Member',
  memberPlural: 'Staff Members',
  groupSingular: 'Department',
  groupPlural: 'Departments',
  taskSingular: 'Task',
  taskPlural: 'Tasks',
};

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

  // Sync custom taxonomy changes to localStorage
  useEffect(() => {
    if (selectedFacilityId) {
      localStorage.setItem(facilityKey(selectedFacilityId, 'taxonomy'), JSON.stringify(taxonomy));
    }
  }, [taxonomy, selectedFacilityId]);

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

  useEffect(() => {
    if (selectedFacilityId) {
      localStorage.setItem(facilityKey(selectedFacilityId, 'custom_shifts'), JSON.stringify(shifts));
    }
  }, [shifts, selectedFacilityId]);

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
