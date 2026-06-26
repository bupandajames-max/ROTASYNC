// Firestore security rules tests, run against the local emulator.
//
// These exist to catch exactly the class of bug this project hit twice:
// a privilege-escalation hole that was only found by reading the rules file
// line by line, and a cross-tenant read leak that survived several earlier
// "isolation" passes because nothing ever exercised the rules directly.
//
// Run with: firebase emulators:exec --only firestore "npx vitest run tests/firestore.rules.test.ts"
// Requires a JDK (the Firestore emulator runs on Java) - not available in
// every sandboxed environment, so this suite is excluded from the default
// `npm test` run (see vitest.config.ts's include pattern) and must be run
// explicitly, e.g. in CI.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { setDoc, getDoc, getDocs, collection, doc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'rotasync-rules-test';
const SUPER_EMAIL = 'bupandajames@gmail.com'; // must match firestore.rules isSuperEmail()

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('users/{uid} — privilege escalation (Phase 0)', () => {
  it('lets a brand-new signed-in user create their own doc at staff level', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'staff', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('blocks a user from self-creating their own doc at an elevated level', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('blocks a user from self-escalating an existing staff-level doc to manager', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await setDoc(doc(alice.firestore(), 'users/alice-uid'), {
      id: 'alice-uid', email: 'alice@example.com', accessLevel: 'staff', facilityId: 'fac-1', departmentId: '',
    });
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('allows re-affirming an already-elevated level (no-op), so a legitimate manager is not logged out', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/bob-uid'), {
        id: 'bob-uid', email: 'bob@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      });
    });
    const bob = testEnv.authenticatedContext('bob-uid', { email: 'bob@example.com' });
    await assertSucceeds(
      setDoc(doc(bob.firestore(), 'users/bob-uid'), {
        id: 'bob-uid', email: 'bob@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('allows an existing facility manager to elevate a different user within their own facility', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/manager-uid'), {
        id: 'manager-uid', email: 'manager@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      });
      await setDoc(doc(ctx.firestore(), 'users/carol-uid'), {
        id: 'carol-uid', email: 'carol@example.com', accessLevel: 'staff', facilityId: 'fac-1', departmentId: '',
      });
    });
    const manager = testEnv.authenticatedContext('manager-uid', { email: 'manager@example.com' });
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'users/carol-uid'), {
        id: 'carol-uid', email: 'carol@example.com', accessLevel: 'dept_head', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('blocks a facility manager from elevating a user in a DIFFERENT facility', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/manager-uid'), {
        id: 'manager-uid', email: 'manager@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      });
      await setDoc(doc(ctx.firestore(), 'users/dave-uid'), {
        id: 'dave-uid', email: 'dave@example.com', accessLevel: 'staff', facilityId: 'fac-OTHER', departmentId: '',
      });
    });
    const manager = testEnv.authenticatedContext('manager-uid', { email: 'manager@example.com' });
    await assertFails(
      setDoc(doc(manager.firestore(), 'users/dave-uid'), {
        id: 'dave-uid', email: 'dave@example.com', accessLevel: 'dept_head', facilityId: 'fac-OTHER', departmentId: '',
      })
    );
  });

  it('blocks a plain staff member from elevating anyone, including themself-adjacent writes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/staffer-uid'), {
        id: 'staffer-uid', email: 'staffer@example.com', accessLevel: 'staff', facilityId: 'fac-1', departmentId: '',
      });
      await setDoc(doc(ctx.firestore(), 'users/eve-uid'), {
        id: 'eve-uid', email: 'eve@example.com', accessLevel: 'staff', facilityId: 'fac-1', departmentId: '',
      });
    });
    const staffer = testEnv.authenticatedContext('staffer-uid', { email: 'staffer@example.com' });
    await assertFails(
      setDoc(doc(staffer.firestore(), 'users/eve-uid'), {
        id: 'eve-uid', email: 'eve@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      })
    );
  });

  it('lets the bootstrap superuser email self-create at superuser level', async () => {
    const root = testEnv.authenticatedContext('root-uid', { email: SUPER_EMAIL });
    await assertSucceeds(
      setDoc(doc(root.firestore(), 'users/root-uid'), {
        id: 'root-uid', email: SUPER_EMAIL, accessLevel: 'superuser', facilityId: '', departmentId: '',
      })
    );
  });
});

describe('Tenant read isolation (Phase 1)', () => {
  const seed = async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/mgr1-uid'), {
        id: 'mgr1-uid', email: 'mgr1@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', departmentId: '',
      });
      await setDoc(doc(ctx.firestore(), 'staff/staff-a'), {
        id: 'staff-a', name: 'A', email: 'a@example.com', role: 'Worker', facilityId: 'fac-1',
      });
      await setDoc(doc(ctx.firestore(), 'staff/staff-b'), {
        id: 'staff-b', name: 'B', email: 'b@example.com', role: 'Worker', facilityId: 'fac-OTHER',
      });
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), { id: 'fac-1', name: 'Mine Facility', location: 'Here' });
      await setDoc(doc(ctx.firestore(), 'facilities/fac-OTHER'), { id: 'fac-OTHER', name: 'Other Tenant', location: 'Elsewhere' });
    });
  };

  it('lets a facility manager read a staff doc within their own facility', async () => {
    await seed();
    const mgr1 = testEnv.authenticatedContext('mgr1-uid', { email: 'mgr1@example.com' });
    await assertSucceeds(getDoc(doc(mgr1.firestore(), 'staff/staff-a')));
  });

  it('blocks a facility manager from reading a staff doc in a different tenant', async () => {
    await seed();
    const mgr1 = testEnv.authenticatedContext('mgr1-uid', { email: 'mgr1@example.com' });
    await assertFails(getDoc(doc(mgr1.firestore(), 'staff/staff-b')));
  });

  it('blocks a facility manager from reading another tenant\'s facility doc directly', async () => {
    await seed();
    const mgr1 = testEnv.authenticatedContext('mgr1-uid', { email: 'mgr1@example.com' });
    await assertFails(getDoc(doc(mgr1.firestore(), 'facilities/fac-OTHER')));
  });

  it('blocks an unscoped list query across all staff (the bug class this phase fixed)', async () => {
    await seed();
    const mgr1 = testEnv.authenticatedContext('mgr1-uid', { email: 'mgr1@example.com' });
    await assertFails(getDocs(collection(mgr1.firestore(), 'staff')));
  });

  it('lets a super user read across tenants', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/root-uid'), {
        id: 'root-uid', email: SUPER_EMAIL, accessLevel: 'superuser', facilityId: '', departmentId: '',
      });
    });
    const root = testEnv.authenticatedContext('root-uid', { email: SUPER_EMAIL });
    await assertSucceeds(getDoc(doc(root.firestore(), 'staff/staff-b')));
  });

  it('blocks a signed-in stranger with no staff/users doc at all from reading any tenant data', async () => {
    await seed();
    const stranger = testEnv.authenticatedContext('stranger-uid', { email: 'stranger@example.com' });
    await assertFails(getDoc(doc(stranger.firestore(), 'staff/staff-a')));
    await assertFails(getDoc(doc(stranger.firestore(), 'facilities/fac-1')));
  });
});

describe('platformAdmins (Phase 2)', () => {
  it('blocks a non-admin from granting themselves platform admin', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'platformAdmins/alice-uid'), { id: 'alice-uid', email: 'alice@example.com' })
    );
  });

  it('lets the bootstrap superuser grant platform admin to someone else', async () => {
    const root = testEnv.authenticatedContext('root-uid', { email: SUPER_EMAIL });
    await assertSucceeds(
      setDoc(doc(root.firestore(), 'platformAdmins/alice-uid'), { id: 'alice-uid', email: 'alice@example.com' })
    );
  });

  it('lets a granted platform admin then grant/revoke admin status for others', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformAdmins/alice-uid'), { id: 'alice-uid', email: 'alice@example.com' });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'platformAdmins/bob-uid'), { id: 'bob-uid', email: 'bob@example.com' })
    );
    await assertSucceeds(deleteDoc(doc(alice.firestore(), 'platformAdmins/bob-uid')));
  });
});
