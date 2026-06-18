# Firestore Security Specification (ABAC & Zero-Trust Verification)

This document formalizes the validation invariants, authorization matrices, and protection boundaries for the Mary Begg Unit Clinic Roster and Task Allocator database collections.

## 1. Domain Data Invariants

- **Read Access Boundaries**: Staff profiles and task logs can be read by any signed-in clinic staff belonging to the respective unit.
- **Write Access Boundaries**: System administrative settings (Facilities and Departments) can only be written by trusted Site Lead/Manager accounts.
- **Staff Record Integrity**: No staff member can escalate their own record's profile privileges (e.g., setting `isManager` to true) or change their assigned `facilityId`.
- **Roster & Hours Authorization**: Roster cycles can only be established, updated, or locked by verified Managers. DailyTask logs can be advanced to specific statuses (e.g., "Done", "Pending Review") by Staff assignees, but only supervisors/managers can countersign or sign off compliances.
- **Timesheet State Machine**: Timesheets start as "Draft". Staff members can modify and submit their timesheets, moving the status to "Submitted". Supervisors/Managers can transition the status to "Approved" or "Rejected" along with comments, but cannot revert "Approved" timesheets back to "Draft".
- **Temporal Constraint**: All document audits (`createdAt`/`updatedAt`) must validate strictly against the server-generated timestamp (`request.time`).

---

## 2. The "Dirty Dozen" Invalidation Payloads

These 12 scenarios represent malicious attempt vectors designed to bypass security. Our security rules are written to guarantee that each of these attempts returns a strict `PERMISSION_DENIED`.

### Payload 1: Privilege Escalation via User Profile Injection
- **Target Collection**: `/staff/{staffId}`
- **Vector**: Non-manager staff member attempts to self-update their profile, setting `isManager = true`.
- **Payload**:
  ```json
  {
    "id": "staff-nurse-1",
    "name": "Jane",
    "email": "jane@marybegg.com",
    "isManager": true
  }
  ```

### Payload 2: Cross-Tenant Facility Hijacking
- **Target Collection**: `/facilities/{facilityId}`
- **Vector**: A normal staff member attempts to create/overwrite a new corporate facility.
- **Payload**:
  ```json
  {
    "id": "hacked-clinic",
    "name": "Rogue Corporate Clinic",
    "leadManager": "Malicious Actor",
    "location": "Lusaka"
  }
  ```

### Payload 3: Orphaned Roster Creation
- **Target Collection**: `/cycles/{cycleId}`
- **Vector**: Creating a cycle roster referencing a non-existent clinic or empty date ranges.
- **Payload**:
  ```json
  {
    "id": "cycle-fake-uuid",
    "startDate": "",
    "endDate": "",
    "shifts": {}
  }
  ```

### Payload 4: Overtime Log Authentication Spoofing
- **Target Collection**: `/extraHours/{extraHoursId}`
- **Vector**: Staff member attempts to write pre-authorized extra hours and forge the `approvedBy` supervisor name string.
- **Payload**:
  ```json
  {
    "id": "eh-log-123",
    "staffName": "Chileshe",
    "shiftDate": "2026-06-18",
    "hours": 12,
    "approvedBy": "Clinic Lead"
  }
  ```

### Payload 5: Timesheet Interception (PII Leak)
- **Target Collection**: `/timesheets/{timesheetId}`
- **Vector**: Staff member attempts to read another staff member's private monthly timesheet.
- **Payload**:
  `GET /timesheets/ts-malicious-attacker` (where the document contains another user's email, wage rates, and hours metrics).

### Payload 6: Force-Approval of Pending Timesheet
- **Target Collection**: `/timesheets/{timesheetId}`
- **Vector**: Staff member attempts to alter the status of their timesheet directly from "Draft" or "Submitted" to "Approved" bypass manager check.
- **Payload**:
  ```json
  {
    "status": "Approved",
    "approvedBy": "Admin Hack"
  }
  ```

### Payload 7: Terminal State Modification of Approved Timesheet
- **Target Collection**: `/timesheets/{timesheetId}`
- **Vector**: Modifying a completed/approved timesheet to add rogue overtime hours after signoff.
- **Payload**:
  ```json
  {
    "status": "Approved",
    "days": {
      "2026-06-15": { "overtimeHours": 15, "regularWorkedHours": 8 }
    }
  }
  ```

### Payload 8: Rogue Task Injection with Spoofed Category
- **Target Collection**: `/taskMasters/{taskMasterId}`
- **Vector**: Injecting an unapproved clinical task with a spoofed or unlisted operations category.
- **Payload**:
  ```json
  {
    "name": "Malicious Clinical Workround",
    "category": "RogueCategory-Unlisted-X",
    "pattern": "Shift-based",
    "priority": "Critical"
  }
  ```

### Payload 9: Denial-of-Wallet Path Variable Poisoning
- **Target Collection**: `/dailyTasks/{taskId}`
- **Vector**: Attempting to create a task log with a massive, malicious 2KB junk character ID.
- **Payload Document ID**: `dailyTasks_MALICIOUS_path_poison_999999999999999999999999999999999999` (exceeding length constraint to exhaust storage indexes).

### Payload 10: Signature Forgery for Daily task Compliance
- **Target Collection**: `/dailyTasks/{taskId}`
- **Vector**: A standard staff member setting `compliance = true` and writing an arbitrary supervisor string in the `counterSign` field.
- **Payload**:
  ```json
  {
    "compliance": true,
    "counterSign": "Dr. Executive Medical Director"
  }
  ```

### Payload 11: Future/Client-Manipulated Timestamps
- **Target Collection**: `/approvals/{approvalId}`
- **Vector**: Supplying a custom client side timestamp in the past/future to alter audit validation.
- **Payload**:
  ```json
  {
    "id": "app-v-1",
    "timestamp": "2035-01-01 00:00",
    "type": "SWAP",
    "status": "Pending"
  }
  ```

### Payload 12: Blank Request Submissions
- **Target Collection**: `/approvals/{approvalId}`
- **Vector**: Creating swap or monthly approvals with null or omitted values to bypass mandatory key checks.
- **Payload**:
  ```json
  {
    "id": "app-v-empty",
    "status": "Pending"
  }
  ```

---

## 3. Test Runner Design Code

The following unit-test code outlines how safety boundaries are verified using the modern testing harness.

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Mary Begg Roster System - Firestore Rules Security Audit', () => {
  let testEnv: any;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'gen-lang-client-0706186972',
      firestore: {
        host: 'localhost',
        port: 8080,
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('Denies non-manger from escalating raw isManager privileges', async () => {
    const context = testEnv.authenticatedContext('staff-user');
    const db = context.firestore();
    const maliciousDoc = db.collection('staff').doc('staff-user');
    
    await assertFails(maliciousDoc.update({
      isManager: true
    }));
  });

  it('Denies unauthorized creation of new clinic facilities', async () => {
    const context = testEnv.authenticatedContext('staff-user');
    const db = context.firestore();
    await assertFails(db.collection('facilities').doc('new-rogue').set({
      id: 'new-rogue',
      name: 'Rogue clinic',
      location: 'Kitwe'
    }));
  });
});
```
