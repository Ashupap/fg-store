import { getDb } from '../lib/db';
import { hasPermission } from '../lib/auth';
import type { UserPublic } from '../types';

const db = getDb();

function setupTestEnvironment() {
    console.log('  [Setup] Initializing custom roles test data...');

    // 1. Create a custom test role: "test_inspector" with specific permissions
    db.prepare("INSERT INTO roles (name, permissions, is_system) VALUES (?, ?, 0)")
      .run('test_inspector', JSON.stringify(['reports:view', 'inward:create']));

    // 2. Create a test user: "test_inspector_user" and assign to "test_inspector" role
    db.prepare(`
        INSERT INTO users (id, username, email, password_hash, name, role, is_active)
        VALUES (888, 'test_inspector_user', 'test_inspector@example.com', 'hash', 'Test Inspector', 'test_inspector', 1)
    `).run();
}

function cleanupTestEnvironment() {
    console.log('  [Cleanup] Removing custom roles test data...');
    db.prepare("DELETE FROM users WHERE id = 888").run();
    db.prepare("DELETE FROM roles WHERE name = 'test_inspector'").run();
}

function fetchUserPublic(userId: number): UserPublic | null {
    const user = db.prepare('SELECT id, email, username, name, role FROM users WHERE id = ? AND is_active = 1').get(userId) as any;
    if (!user) return null;

    // Load permissions dynamically like the auth logic does
    const roleData = db.prepare('SELECT permissions FROM roles WHERE name = ?').get(user.role) as { permissions: string } | undefined;
    user.permissions = roleData ? JSON.parse(roleData.permissions) : [];
    
    user.assigned_store_ids = [];
    user.assigned_store_names = [];
    return user;
}

function runTests() {
    console.log('=== Starting Custom Roles & Permissions Verification ===');
    cleanupTestEnvironment();
    setupTestEnvironment();

    try {
        // --- Test 1: Fetch user and check custom permissions ---
        console.log('\nTest 1: Check initial custom permissions...');
        const user = fetchUserPublic(888);
        if (!user) {
            throw new Error('Failed to fetch test user');
        }

        console.log(`  User Role: ${user.role}`);
        console.log(`  User Permissions: [${user.permissions?.join(', ') || ''}]`);

        const canViewReports = hasPermission(user, 'reports:view');
        const canCreateInward = hasPermission(user, 'inward:create');
        const canApproveTransfer = hasPermission(user, 'transfer:approve');

        console.log(`  - Can view reports (Expected: true) ➔ ${canViewReports}`);
        console.log(`  - Can create inward (Expected: true) ➔ ${canCreateInward}`);
        console.log(`  - Can approve transfers (Expected: false) ➔ ${canApproveTransfer}`);

        if (canViewReports && canCreateInward && !canApproveTransfer) {
            console.log('  ✅ Test 1 Passed: Custom permissions validated successfully.');
        } else {
            console.error('  ❌ Test 1 Failed: Permission check returned incorrect values.');
        }

        // --- Test 2: Update custom role and verify changes are dynamic ---
        console.log('\nTest 2: Modifying custom role permissions dynamically...');
        
        // Add 'transfer:approve' and remove 'inward:create'
        db.prepare("UPDATE roles SET permissions = ? WHERE name = 'test_inspector'")
          .run(JSON.stringify(['reports:view', 'transfer:approve']));

        const updatedUser = fetchUserPublic(888);
        if (!updatedUser) {
            throw new Error('Failed to fetch updated test user');
        }

        console.log(`  Updated Permissions: [${updatedUser.permissions?.join(', ') || ''}]`);

        const canCreateInwardAfter = hasPermission(updatedUser, 'inward:create');
        const canApproveTransferAfter = hasPermission(updatedUser, 'transfer:approve');

        console.log(`  - Can create inward (Expected: false) ➔ ${canCreateInwardAfter}`);
        console.log(`  - Can approve transfers (Expected: true) ➔ ${canApproveTransferAfter}`);

        if (!canCreateInwardAfter && canApproveTransferAfter) {
            console.log('  ✅ Test 2 Passed: Dynamic permissions update validated successfully.');
        } else {
            console.error('  ❌ Test 2 Failed: Permissions did not update dynamically.');
        }

        // --- Test 3: Delete custom role and ensure users fallback safely ---
        console.log('\nTest 3: Deleting custom role and verifying user fallback...');

        // In the route handler, deleting a custom role resets any users with that role to "operator"
        const transaction = db.transaction(() => {
            // Reset any users of this role to 'operator'
            db.prepare("UPDATE users SET role = 'operator' WHERE role = 'test_inspector'").run();
            // Delete role
            db.prepare("DELETE FROM roles WHERE name = 'test_inspector'").run();
        });
        transaction();

        const userAfterDelete = fetchUserPublic(888);
        if (!userAfterDelete) {
            throw new Error('Failed to fetch user after role deletion');
        }

        console.log(`  User Role after role deletion (Expected: operator) ➔ ${userAfterDelete.role}`);
        console.log(`  User Permissions (Expected: operator permissions) ➔ [${userAfterDelete.permissions?.join(', ') || ''}]`);

        const hasOperatorInward = hasPermission(userAfterDelete, 'inward:create');
        const hasOperatorReports = hasPermission(userAfterDelete, 'reports:view');

        console.log(`  - Has operator inward rights (Expected: true) ➔ ${hasOperatorInward}`);
        console.log(`  - Has operator report rights (Expected: false) ➔ ${hasOperatorReports}`);

        if (userAfterDelete.role === 'operator' && hasOperatorInward && !hasOperatorReports) {
            console.log('  ✅ Test 3 Passed: Role deletion fallback to "operator" verified.');
        } else {
            console.error('  ❌ Test 3 Failed: User did not fall back safely or operator rights mismatched.');
        }

    } catch (error) {
        console.error('  ❌ Unexpected Test Error:', error);
    } finally {
        cleanupTestEnvironment();
        console.log('\n=== Verification Complete ===');
    }
}

runTests();
