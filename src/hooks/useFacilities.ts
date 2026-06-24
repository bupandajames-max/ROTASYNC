import { useEffect, useState } from 'react';
import { dbSetDoc, dbDeleteDoc } from '../firebase';
import { GLOBAL_KEYS } from '../utils/storageKeys';
import type { Facility, Department } from '../types';

/**
 * Owns the facilities + departments domain: the list of workspaces, which
 * one is currently selected, and CRUD for both. Everything here is about
 * "which workspace, and what departments does it have" — roster/staff/task
 * state lives elsewhere and just reacts to `selectedFacilityId`.
 */
export function useFacilities(
  firebaseUser: any,
  handleGenericError: (error: any) => void
) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(() => {
    try { return localStorage.getItem(GLOBAL_KEYS.lastFacility) || ''; } catch { return ''; }
  });
  const [departments, setDepartments] = useState<Department[]>([]);

  // Remember last active facility for next load
  useEffect(() => {
    if (selectedFacilityId) {
      try { localStorage.setItem(GLOBAL_KEYS.lastFacility, selectedFacilityId); } catch {}
    }
  }, [selectedFacilityId]);

  // Sync custom departments to localStorage
  useEffect(() => {
    localStorage.setItem(GLOBAL_KEYS.departments, JSON.stringify(departments));
  }, [departments]);

  const handleCreateFacility = (newFac: Facility) => {
    const updated = [...facilities, newFac];
    setFacilities(updated);
    localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(updated));
    setSelectedFacilityId(newFac.id);

    if (firebaseUser) {
      dbSetDoc('facilities', newFac.id, newFac).catch(handleGenericError);
    }
  };

  const handleUpdateFacility = (updatedFac: Facility) => {
    const updated = facilities.map(f => f.id === updatedFac.id ? updatedFac : f);
    setFacilities(updated);
    localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(updated));

    if (firebaseUser) {
      dbSetDoc('facilities', updatedFac.id, updatedFac).catch(handleGenericError);
    }
  };

  const handleDeleteFacility = async (facilityId: string) => {
    const updated = facilities.filter(f => f.id !== facilityId);
    setFacilities(updated);
    localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(updated));

    if (selectedFacilityId === facilityId) {
      if (updated.length > 0) {
        setSelectedFacilityId(updated[0].id);
      } else {
        setSelectedFacilityId('');
      }
    }

    if (firebaseUser) {
      try {
        await dbDeleteDoc('facilities', facilityId);
      } catch (e) {
        console.error('Failed to delete facility from Firestore', e);
        handleGenericError(e);
      }
    }
  };

  const handleCreateDepartment = async (newDept: Department) => {
    const updated = [...departments, newDept];
    setDepartments(updated);
    localStorage.setItem(GLOBAL_KEYS.departments, JSON.stringify(updated));
    if (firebaseUser) {
      try {
        await dbSetDoc('departments', newDept.id, newDept);
      } catch (e) {
        console.error('Failed to write department to Firestore', e);
        handleGenericError(e);
      }
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    const updated = departments.filter(d => d.id !== deptId);
    setDepartments(updated);
    localStorage.setItem(GLOBAL_KEYS.departments, JSON.stringify(updated));
    if (firebaseUser) {
      try {
        await dbDeleteDoc('departments', deptId);
      } catch (e) {
        console.error('Failed to delete department from Firestore', e);
        handleGenericError(e);
      }
    }
  };

  return {
    facilities,
    setFacilities,
    selectedFacilityId,
    setSelectedFacilityId,
    departments,
    setDepartments,
    handleCreateFacility,
    handleUpdateFacility,
    handleDeleteFacility,
    handleCreateDepartment,
    handleDeleteDepartment,
  };
}
