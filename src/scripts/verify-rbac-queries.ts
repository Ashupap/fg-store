
import { getDb } from '../lib/db';

const db = getDb();

function runRBACVerification() {
    console.log('=== Starting RBAC Query Verification ===');

    try {
        // 1. Setup Data
        console.log('[Setup] Creating test environment...');

        // Stores
        db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('RBAC_Store_A', 100, 1)").run();
        db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('RBAC_Store_B', 100, 1)").run();

        const storeA = db.prepare("SELECT id, name FROM stores WHERE name = 'RBAC_Store_A'").get() as any;
        const storeB = db.prepare("SELECT id, name FROM stores WHERE name = 'RBAC_Store_B'").get() as any;

        // Users
        // Manager A (Assigned to A)
        db.prepare("INSERT INTO users (username, email, password_hash, name, role) VALUES ('mgr_a', 'mgr_a@test.com', 'hash', 'Manager A', 'manager')").run();
        const mgrA = db.prepare("SELECT * FROM users WHERE username = 'mgr_a'").get() as any;
        mgrA.assigned_store_names = [storeA.name];
        mgrA.assigned_store_ids = [storeA.id];

        // Manager B (Assigned to B)
        db.prepare("INSERT INTO users (username, email, password_hash, name, role) VALUES ('mgr_b', 'mgr_b@test.com', 'hash', 'Manager B', 'manager')").run();
        const mgrB = db.prepare("SELECT * FROM users WHERE username = 'mgr_b'").get() as any;
        mgrB.assigned_store_names = [storeB.name];
        mgrB.assigned_store_ids = [storeB.id];

        // Stock Data
        // A: 10 MCs
        db.prepare("INSERT INTO fg_stock_master (grade, packing_code, cold_store, status, packing_date, mc_number) VALUES ('A', 'P1', 'RBAC_Store_A', 'Available', '2025-01-01', 'MC-A-1')").run();
        // B: 5 MCs
        db.prepare("INSERT INTO fg_stock_master (grade, packing_code, cold_store, status, packing_date, mc_number) VALUES ('A', 'P1', 'RBAC_Store_B', 'Available', '2025-01-01', 'MC-B-1')").run();

        // Pending Movement Data
        // Movement 1: Inward into A (Pending)
        db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, qty_mcs, status, moved_by_id)
            VALUES ('MOV-1', '2025-01-01', 'INWARD', 'RBAC_Store_A', 50, 'Pending Approval', ${mgrA.id})
        `).run();

        // Movement 2: Transfer B -> A (Pending)
        db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, qty_mcs, status, moved_by_id)
            VALUES ('MOV-2', '2025-01-01', 'TRANSFER', 'RBAC_Store_B', 'RBAC_Store_A', 20, 'Pending Approval', ${mgrB.id})
        `).run();


        // --- Test 1: Stock View Logic (simulating api/stock/route.ts) ---
        console.log('\n[Test 1] Verifying Stock View Logic...');

        function getStockForUser(user: any) {
            const isRestricted = user.role !== 'admin';
            const allowedNames = user.assigned_store_names || [];
            let whereClause = "WHERE status = 'Available'";
            const params: any[] = [];

            if (isRestricted) {
                if (allowedNames.length === 0) return [];
                const placeholders = allowedNames.map(() => '?').join(',');
                whereClause += ` AND cold_store IN (${placeholders})`;
                params.push(...allowedNames);
            }

            return db.prepare(`SELECT cold_store, COUNT(*) as c FROM fg_stock_master ${whereClause} GROUP BY cold_store`).all(...params) as any[];
        }

        const viewA = getStockForUser(mgrA);
        const viewB = getStockForUser(mgrB);

        console.log('Manager A sees:', viewA);
        console.log('Manager B sees:', viewB);

        if (viewA.length === 1 && viewA[0].cold_store === 'RBAC_Store_A' && viewB.length === 1 && viewB[0].cold_store === 'RBAC_Store_B') {
            console.log('✅ Stock View Logic Passed');
        } else {
            console.error('❌ Stock View Logic Failed');
        }


        // --- Test 2: Pending Approvals Logic (simulating api/movement/pending/route.ts) ---
        console.log('\n[Test 2] Verifying Pending View Logic...');

        function getPendingForUser(user: any) {
            if (user.role === 'admin') return []; // skip admin logic

            // Managers logic
            if (!user.assigned_store_names || user.assigned_store_names.length === 0) return [];

            const placeholders = user.assigned_store_names.map(() => '?').join(',');
            const params = [...user.assigned_store_names, ...user.assigned_store_names];

            return db.prepare(`
                SELECT movement_id, from_location, to_location 
                FROM stock_movement_log 
                WHERE status = 'Pending Approval'
                AND (from_location IN (${placeholders}) OR to_location IN (${placeholders}))
            `).all(...params) as any[];
        }

        const pendingA = getPendingForUser(mgrA); // Should see MOV-1 (Inward A) AND MOV-2 (Transfer B->A)
        const pendingB = getPendingForUser(mgrB); // Should see MOV-2 (Transfer B->A) only. (MOV-1 is pure A)

        console.log('Manager A Pending:', pendingA);
        console.log('Manager B Pending:', pendingB);

        const hasMov1InA = pendingA.some((m: any) => m.movement_id === 'MOV-1');
        const hasMov2InA = pendingA.some((m: any) => m.movement_id === 'MOV-2');
        const hasMov1InB = pendingB.some((m: any) => m.movement_id === 'MOV-1');
        const hasMov2InB = pendingB.some((m: any) => m.movement_id === 'MOV-2');

        if (hasMov1InA && hasMov2InA && !hasMov1InB && hasMov2InB) {
            console.log('✅ Pending Movement Logic Passed');
        } else {
            console.error('❌ Pending Movement Logic Failed');
            console.log(`Expected A to see MOV-1 & MOV-2. Got MOV-1:${hasMov1InA}, MOV-2:${hasMov2InA}`);
            console.log(`Expected B to see ONLY MOV-2. Got MOV-1:${hasMov1InB}, MOV-2:${hasMov2InB}`);
        }

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        console.log('[Cleanup]...');
        db.prepare("DELETE FROM user_stores WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'mgr_%')").run();
        db.prepare("DELETE FROM stock_movement_log WHERE movement_id LIKE 'MOV-%'").run();
        db.prepare("DELETE FROM fg_stock_master WHERE mc_number LIKE 'MC-%'").run();
        db.prepare("DELETE FROM users WHERE username LIKE 'mgr_%'").run();
        db.prepare("DELETE FROM stores WHERE name LIKE 'RBAC_%'").run();
    }
}

runRBACVerification();
