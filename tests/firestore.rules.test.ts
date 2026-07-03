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

describe('organizations/{orgId} — self-serve org bootstrap', () => {
  it('lets a brand-new signed-in user create an organization they own', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid: 'alice-uid', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks creating an organization claimed as owned by someone else', async () => {
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid: 'someone-else-uid', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks a stranger from reading an organization they do not own or belong to', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid: 'alice-uid', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const bob = testEnv.authenticatedContext('bob-uid', { email: 'bob@example.com' });
    await assertFails(getDoc(doc(bob.firestore(), 'organizations/org-1')));
  });
});

describe('facilities/{facilityId} — first-run bootstrap under an owned organization', () => {
  const seedOrg = async (ownerUid: string) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid, createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  };

  it('lets the org owner create their first facility under it', async () => {
    await seedOrg('alice-uid');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'facilities/fac-1'), {
        id: 'fac-1', name: 'Acme HQ', location: 'Lusaka', organizationId: 'org-1',
      })
    );
  });

  it('blocks creating a facility under an organization the caller does not own', async () => {
    await seedOrg('someone-else-uid');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'facilities/fac-1'), {
        id: 'fac-1', name: 'Acme HQ', location: 'Lusaka', organizationId: 'org-1',
      })
    );
  });

  it('blocks a user who already belongs to a facility from bootstrapping another one', async () => {
    await seedOrg('alice-uid');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'facility_manager', facilityId: 'fac-existing', departmentId: '',
      });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'facilities/fac-2'), {
        id: 'fac-2', name: 'Second Site', location: 'Ndola', organizationId: 'org-1',
      })
    );
  });
});

describe('users/{uid} — org-bootstrap and invite-grant escape hatches', () => {
  it('lets the org+facility bootstrap owner self-create users/{uid} at facility_manager', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid: 'alice-uid', createdAt: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), {
        id: 'fac-1', name: 'Acme HQ', location: 'Lusaka', organizationId: 'org-1',
      });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', organizationId: 'org-1', departmentId: '',
      })
    );
  });

  it('blocks self-creating at facility_manager when the facility does not actually belong to the claimed organization', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations/org-1'), {
        id: 'org-1', name: 'Acme Logistics', ownerUid: 'alice-uid', createdAt: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), { id: 'fac-1', name: 'Unrelated', location: 'Lusaka' });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice-uid'), {
        id: 'alice-uid', email: 'alice@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', organizationId: 'org-1', departmentId: '',
      })
    );
  });

  it('lets an invited user self-create users/{uid} at exactly the level their invite grants', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'dept_head', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const carol = testEnv.authenticatedContext('carol-uid', { email: 'carol@example.com' });
    await assertSucceeds(
      setDoc(doc(carol.firestore(), 'users/carol-uid'), {
        id: 'carol-uid', email: 'carol@example.com', accessLevel: 'dept_head', facilityId: 'fac-1', organizationId: 'org-1', departmentId: '',
      })
    );
  });

  it('blocks self-creating users/{uid} at a level higher than the invite actually grants', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const carol = testEnv.authenticatedContext('carol-uid', { email: 'carol@example.com' });
    await assertFails(
      setDoc(doc(carol.firestore(), 'users/carol-uid'), {
        id: 'carol-uid', email: 'carol@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', organizationId: 'org-1', departmentId: '',
      })
    );
  });

  it('blocks self-creating at an elevated level with no invite at all', async () => {
    const dave = testEnv.authenticatedContext('dave-uid', { email: 'dave@example.com' });
    await assertFails(
      setDoc(doc(dave.firestore(), 'users/dave-uid'), {
        id: 'dave-uid', email: 'dave@example.com', accessLevel: 'facility_manager', facilityId: 'fac-1', organizationId: 'org-1', departmentId: '',
      })
    );
  });
});

describe('invites/{inviteId}', () => {
  const seedManager = async (level: string, facilityId = 'fac-1') => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/mgr-uid'), {
        id: 'mgr-uid', email: 'mgr@example.com', accessLevel: level, facilityId, organizationId: 'org-1', departmentId: '',
      });
    });
  };

  it('lets a facility manager create an invite scoped to their own facility/org', async () => {
    await seedManager('facility_manager');
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertSucceeds(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('lets the bootstrap super user create an invite even though their own org is empty (the invite-failure bug)', async () => {
    // Regression: a super user (org owner) has no single organization, so
    // callerOrganization() is '' and the org-match could never pass for
    // them — which is exactly why real invites were denied. isSuper() now
    // bypasses that check (same as it already bypasses inMyFacility).
    const root = testEnv.authenticatedContext('root-uid', { email: SUPER_EMAIL });
    await assertSucceeds(
      setDoc(doc(root.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'facility_manager', invitedBy: SUPER_EMAIL, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('still blocks a non-super manager whose org does not match the invite org', async () => {
    // The isSuper() bypass must NOT leak to ordinary managers — a manager in
    // org-1 cannot mint an invite claiming org-2.
    await seedManager('facility_manager');
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertFails(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-OTHER', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks a dept_head from inviting someone as facility_manager (role cap)', async () => {
    await seedManager('dept_head');
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertFails(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'facility_manager', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks an invite whose ID does not match its own facilityId+email', async () => {
    await seedManager('facility_manager');
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertFails(
      setDoc(doc(mgr.firestore(), 'invites/wrong-id'), {
        id: 'wrong-id', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks a manager from creating an invite into a different facility', async () => {
    await seedManager('facility_manager', 'fac-1');
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertFails(
      setDoc(doc(mgr.firestore(), 'invites/fac-OTHER--carol@example.com'), {
        id: 'fac-OTHER--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-OTHER',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('lets the invitee read their own pending invite by email', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const carol = testEnv.authenticatedContext('carol-uid', { email: 'carol@example.com' });
    await assertSucceeds(getDoc(doc(carol.firestore(), 'invites/fac-1--carol@example.com')));
  });

  it('blocks a stranger from reading someone else\'s invite', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const dave = testEnv.authenticatedContext('dave-uid', { email: 'dave@example.com' });
    await assertFails(getDoc(doc(dave.firestore(), 'invites/fac-1--carol@example.com')));
  });

  it('lets the invitee accept their own pending invite (status flip only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const carol = testEnv.authenticatedContext('carol-uid', { email: 'carol@example.com' });
    await assertSucceeds(
      setDoc(doc(carol.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'accepted', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('blocks the invitee from escalating their own role while accepting', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const carol = testEnv.authenticatedContext('carol-uid', { email: 'carol@example.com' });
    await assertFails(
      setDoc(doc(carol.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'facility_manager', invitedBy: 'mgr@example.com', status: 'accepted', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('lets a facility manager revoke a pending invite in their own facility', async () => {
    await seedManager('facility_manager');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertSucceeds(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'revoked', createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
  });

  it('lets a facility manager re-issue an invite after revoking it (regression: writes to an existing doc are updates, not creates)', async () => {
    await seedManager('facility_manager');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'revoked', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertSucceeds(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'dept_head', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-02T00:00:00.000Z',
      })
    );
  });

  it('blocks a dept_head from re-issuing an invite at facility_manager (role cap applies to re-issue too)', async () => {
    await seedManager('dept_head');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'revoked', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const mgr = testEnv.authenticatedContext('mgr-uid', { email: 'mgr@example.com' });
    await assertFails(
      setDoc(doc(mgr.firestore(), 'invites/fac-1--carol@example.com'), {
        id: 'fac-1--carol@example.com', email: 'carol@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'facility_manager', invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-02T00:00:00.000Z',
      })
    );
  });
});

describe('staff/{staffId} self-onboarding (invite-gated join)', () => {
  const seedFacilityAndInvite = async (role: 'staff' | 'dept_head' | 'facility_manager' = 'staff') => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), { id: 'fac-1', name: 'Mine Facility', location: 'Here' });
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--alice@example.com'), {
        id: 'fac-1--alice@example.com', email: 'alice@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role, invitedBy: 'mgr@example.com', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  };

  it('lets an invited user create their own staff doc at exactly the invited role', async () => {
    await seedFacilityAndInvite('staff');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'staff/staff-alice'), {
        id: 'staff-alice', name: 'Alice', email: 'alice@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: false, accessLevel: 'staff',
      })
    );
  });

  it('blocks joining a facility with no invite at all', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), { id: 'fac-1', name: 'Mine Facility', location: 'Here' });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'staff/staff-alice'), {
        id: 'staff-alice', name: 'Alice', email: 'alice@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: false, accessLevel: 'staff',
      })
    );
  });

  it('blocks self-onboarding a staff doc for someone else\'s email', async () => {
    await seedFacilityAndInvite('staff');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'staff/staff-bob'), {
        id: 'staff-bob', name: 'Bob', email: 'bob@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: false, accessLevel: 'staff',
      })
    );
  });

  it('blocks setting accessLevel/isManager higher than the invite grants', async () => {
    await seedFacilityAndInvite('staff');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'staff/staff-alice'), {
        id: 'staff-alice', name: 'Alice', email: 'alice@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: true, accessLevel: 'facility_manager',
      })
    );
  });

  it('blocks self-onboarding once the invite has been revoked', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'facilities/fac-1'), { id: 'fac-1', name: 'Mine Facility', location: 'Here' });
      await setDoc(doc(ctx.firestore(), 'invites/fac-1--alice@example.com'), {
        id: 'fac-1--alice@example.com', email: 'alice@example.com', organizationId: 'org-1', facilityId: 'fac-1',
        role: 'staff', invitedBy: 'mgr@example.com', status: 'revoked', createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertFails(
      setDoc(doc(alice.firestore(), 'staff/staff-alice'), {
        id: 'staff-alice', name: 'Alice', email: 'alice@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: false, accessLevel: 'staff',
      })
    );
  });

  it('lets an invited facility_manager self-onboard with isManager true, matching the invite', async () => {
    await seedFacilityAndInvite('facility_manager');
    const alice = testEnv.authenticatedContext('alice-uid', { email: 'alice@example.com' });
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'staff/staff-alice'), {
        id: 'staff-alice', name: 'Alice', email: 'alice@example.com', role: 'Coordinator', facilityId: 'fac-1', isManager: true, accessLevel: 'facility_manager',
      })
    );
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
