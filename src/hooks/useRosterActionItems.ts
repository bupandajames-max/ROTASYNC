import { useEffect, useState } from 'react';
import { RosterActionItem } from '../types';
import { facilityKey } from '../utils/storageKeys';
import { dbGetCollectionByFacility, dbSetDoc, dbDeleteDoc } from '../firebase';

const nowStamp = () => new Date().toISOString().substring(0, 16).replace('T', ' ');

/**
 * Owns roster action items (the lightweight notes attached to roster cells):
 * per-facility hydration, and CRUD that writes both stores. Follows the same
 * storage model as the other operational collections — localStorage is the
 * instant cache, Firestore is the authority when signed in, so a second
 * manager on another device sees the same items.
 *
 * Items that existed locally before cloud sync shipped are pushed up once
 * when the cloud collection is still empty, instead of being wiped by an
 * empty authoritative read.
 */
export function useRosterActionItems(
  selectedFacilityId: string,
  firebaseUser: any,
  handleGenericError: (error: any) => void
) {
  const [items, setItems] = useState<RosterActionItem[]>([]);

  const persistLocal = (facilityId: string, list: RosterActionItem[]) => {
    try { localStorage.setItem(facilityKey(facilityId, 'roster_action_items'), JSON.stringify(list)); } catch {}
  };

  // Hydrate on facility switch / sign-in: local cache first for instant
  // paint, then the cloud read replaces it as the authority.
  useEffect(() => {
    let active = true;
    if (!selectedFacilityId) { setItems([]); return; }

    let localItems: RosterActionItem[] = [];
    try {
      const stored = localStorage.getItem(facilityKey(selectedFacilityId, 'roster_action_items'));
      localItems = stored ? JSON.parse(stored) : [];
    } catch {}
    setItems(localItems);

    if (firebaseUser) {
      (async () => {
        try {
          const cloud = await dbGetCollectionByFacility<RosterActionItem>('rosterActionItems', selectedFacilityId);
          if (!active) return;
          if (cloud.length === 0 && localItems.length > 0) {
            // One-time migration of pre-cloud local items.
            localItems.forEach(it =>
              dbSetDoc('rosterActionItems', it.id, { ...it, facilityId: it.facilityId || selectedFacilityId }).catch(handleGenericError)
            );
          } else {
            setItems(cloud);
            persistLocal(selectedFacilityId, cloud);
          }
        } catch (err) {
          handleGenericError(err);
        }
      })();
    }
    return () => { active = false; };
    // handleGenericError is a stable callback defined in App; not a re-hydration trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFacilityId, firebaseUser]);

  const persist = (updated: RosterActionItem[]) => {
    setItems(updated);
    if (selectedFacilityId) persistLocal(selectedFacilityId, updated);
  };

  const addItem = (
    item: Omit<RosterActionItem, 'id' | 'createdAt' | 'createdBy' | 'done'>,
    creatorName: string
  ) => {
    const newItem: RosterActionItem = {
      ...item,
      id: `rai-${Date.now()}`,
      done: false,
      createdBy: creatorName,
      createdAt: nowStamp(),
      facilityId: selectedFacilityId,
    };
    persist([...items, newItem]);
    if (firebaseUser) dbSetDoc('rosterActionItems', newItem.id, newItem).catch(handleGenericError);
  };

  const toggleItem = (id: string, actorName: string) => {
    let toggled: RosterActionItem | undefined;
    const updated = items.map(a => {
      if (a.id !== id) return a;
      toggled = { ...a, done: !a.done, updatedAt: nowStamp(), updatedBy: actorName, facilityId: a.facilityId || selectedFacilityId };
      return toggled;
    });
    persist(updated);
    if (firebaseUser && toggled) dbSetDoc('rosterActionItems', toggled.id, toggled).catch(handleGenericError);
  };

  const deleteItem = (id: string) => {
    persist(items.filter(a => a.id !== id));
    if (firebaseUser) dbDeleteDoc('rosterActionItems', id).catch(handleGenericError);
  };

  return { items, addItem, toggleItem, deleteItem };
}
