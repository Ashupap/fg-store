import { getDb } from '../lib/db';
import { handleInward, handleTransfer } from '../lib/stock-logic';

const db = getDb();

function setupTestEnvironment() {
    console.log('  [Setup] Creating stores, sections, users, and assignments...');

    // Create Test Stores
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons, type, is_active) VALUES ('OwnedStore_X', 100, 'Processing Unit', 1)").run();
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons, type, is_active) VALUES ('RentedStore_Y', 50, 'Rented', 1)").run();
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons, type, is_active) VALUES ('OtherStore_Z', 200, 'Cold Store', 1)").run();

    const storeX = db.prepare("SELECT id FROM stores WHERE name = 'OwnedStore_X'").get() as any;
    const storeY = db.prepare("SELECT id FROM stores WHERE name = 'RentedStore_Y'").get() as any;
    const storeZ = db.prepare("SELECT id FROM stores WHERE name = 'OtherStore_Z'").get() as any;

    // Seed sections
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('OwnedStore_X', 'Section A', 500)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('RentedStore_Y', 'Section A', 500)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('OtherStore_Z', 'Section A', 500)").run();

    // Create Test Users
    db.prepare("INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES ('rented_admin@example.com', 'hash', 'Rented Admin', 'admin')").run();
    db.prepare("INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES ('rented_mgr@example.com', 'hash', 'Source Manager', 'manager')").run();
    db.prepare("INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES ('other_mgr@example.com', 'hash', 'Other Manager', 'manager')").run();

    const admin = db.prepare("SELECT id FROM users WHERE email='rented_admin@example.com'").get() as any;
    const manager = db.prepare("SELECT id FROM users WHERE email='rented_mgr@example.com'").get() as any;
    const otherManager = db.prepare("SELECT id FROM users WHERE email='other_mgr@example.com'").get() as any;

    // Assign Stores
    db.prepare("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)").run(manager.id, storeX.id);
    db.prepare("INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)").run(otherManager.id, storeZ.id);

    return {
        adminId: admin.id,
        manager,
        otherManager
    };
}

function cleanupTestEnvironment() {
    console.log('  [Cleanup] Removing test data...');
    db.prepare("DELETE FROM user_stores WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rented_%' OR email LIKE 'other_%')").run();
    db.prepare("DELETE FROM stock_movement_log WHERE from_location IN ('OwnedStore_X', 'RentedStore_Y', 'OtherStore_Z') OR to_location IN ('OwnedStore_X', 'RentedStore_Y', 'OtherStore_Z')").run();
    db.prepare("DELETE FROM fg_stock_master WHERE cold_store IN ('OwnedStore_X', 'RentedStore_Y', 'OtherStore_Z', 'In Transit')").run();
    db.prepare("DELETE FROM users WHERE email LIKE 'rented_%' OR email LIKE 'other_%'").run();
    db.prepare("DELETE FROM store_sections WHERE store_name IN ('OwnedStore_X', 'RentedStore_Y', 'OtherStore_Z')").run();
    db.prepare("DELETE FROM stores WHERE name IN ('OwnedStore_X', 'RentedStore_Y', 'OtherStore_Z')").run();
}

async function runRentedTests() {
    console.log('=== Starting Rented Store Transfer Acceptance & Pending View Tests ===');
    cleanupTestEnvironment();
    const env = setupTestEnvironment();

    try {
        // --- Setup Stock in OwnedStore_X ---
        console.log('\nStep 1: Inwarding 3 cartons to OwnedStore_X...');
        await handleInward({
            type: 'TestType',
            variety: 'TestVariety',
            packing: '10kg',
            grade: 'A',
            qty: 3,
            toStore: 'OwnedStore_X',
            productCode: 'PROD-RENTED-01',
            packingDate: '2025-01-01',
            packingCode: '10KG'
        }, env.adminId);

        const stockCount = db.prepare("SELECT COUNT(*) as c FROM fg_stock_master WHERE cold_store = 'OwnedStore_X'").get() as any;
        console.log(`  Current Stock in OwnedStore_X: ${stockCount.c} MCs`);

        // --- Initiate Transfer to RentedStore_Y ---
        console.log('\nStep 2: Transferring 3 cartons from OwnedStore_X to RentedStore_Y (Rented)...');
        const transferResult = await handleTransfer({
            fromStore: 'OwnedStore_X',
            toStore: 'RentedStore_Y',
            variety: 'TestVariety',
            grade: 'A',
            packing: '10kg',
            type: 'TestType',
            qty: 3,
            allocationStrategy: 'FIFO'
        }, env.manager.id);

        if (!transferResult.success) {
            throw new Error(`Transfer failed: ${transferResult.error}`);
        }
        console.log(`  Transfer Initiated. Movement ID: ${transferResult.moveId}`);

        // Verify cartons are in Transit
        const transitCount = db.prepare("SELECT COUNT(*) as c FROM fg_stock_master WHERE cold_store = 'In Transit'").get() as any;
        console.log(`  Cartons In Transit: ${transitCount.c}`);

        // --- Verify Pending List Query logic for Manager ---
        console.log('\nStep 3: Verifying pending transfer visibility...');
        // Manager's assigned stores: ['OwnedStore_X']
        const managerStores = ['OwnedStore_X'];
        const placeholders = managerStores.map(() => '?').join(',');
        const params = [...managerStores, ...managerStores, ...managerStores, ...managerStores];

        // Run the query to check if the transfer to RentedStore_Y is visible to this manager
        const managerPending = db.prepare(`
            SELECT sml.movement_id
            FROM stock_movement_log sml
            LEFT JOIN stores ts ON sml.to_location = ts.name
            WHERE 
            (
                sml.status = 'Pending Approval'
                AND (
                    sml.from_location IN (${placeholders}) 
                    OR 
                    sml.to_location IN (${placeholders})
                )
            )
            OR
            (
                sml.status = 'In Transit'
                AND (
                    sml.to_location IN (${placeholders})
                    OR
                    (
                        ts.type = 'Rented'
                        AND sml.from_location IN (${placeholders})
                    )
                )
            )
        `).all(...params) as any[];

        const isVisibleToManager = managerPending.some(p => p.movement_id === transferResult.moveId);
        if (isVisibleToManager) {
            console.log('  ✅ Success: Pending in-transit transfer to rented store is visible to the source manager.');
        } else {
            console.error('  ❌ Error: Pending transfer is NOT visible to the source manager.');
        }

        // Other manager (assigned only to OtherStore_Z) should NOT see it
        const otherStores = ['OtherStore_Z'];
        const otherPlaceholders = otherStores.map(() => '?').join(',');
        const otherParams = [...otherStores, ...otherStores, ...otherStores, ...otherStores];

        const otherPending = db.prepare(`
            SELECT sml.movement_id
            FROM stock_movement_log sml
            LEFT JOIN stores ts ON sml.to_location = ts.name
            WHERE 
            (
                sml.status = 'Pending Approval'
                AND (
                    sml.from_location IN (${otherPlaceholders}) 
                    OR 
                    sml.to_location IN (${otherPlaceholders})
                )
            )
            OR
            (
                sml.status = 'In Transit'
                AND (
                    sml.to_location IN (${otherPlaceholders})
                    OR
                    (
                        ts.type = 'Rented'
                        AND sml.from_location IN (${otherPlaceholders})
                    )
                )
            )
        `).all(...otherParams) as any[];

        const isVisibleToOther = otherPending.some(p => p.movement_id === transferResult.moveId);
        if (!isVisibleToOther) {
            console.log('  ✅ Success: Pending transfer is isolated (not visible to other managers).');
        } else {
            console.error('  ❌ Error: Pending transfer is visible to unauthorized other manager.');
        }

        // --- Verify Acceptance Permissions & Rollout ---
        console.log('\nStep 4: Verifying Acceptance Authorization...');

        // Helper mock acceptance logic representing the API accept endpoint
        const attemptAccept = (user: { role: string; assigned_stores: string[] }) => {
            const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(transferResult.moveId) as any;
            
            // Authorization logic
            if (user.role !== 'admin' && user.role !== 'general_manager') {
                const toStoreDetails = db.prepare('SELECT type FROM stores WHERE name = ?').get(movement.to_location) as { type: string } | undefined;
                const isToStoreRented = toStoreDetails?.type === 'Rented';

                const isAuthorized = user.assigned_stores.includes(movement.to_location) || 
                                   (isToStoreRented && user.assigned_stores.includes(movement.from_location));

                if (!isAuthorized) {
                    throw new Error(`Unauthorized: You are not assigned to either the source '${movement.from_location}' or destination '${movement.to_location}' stores`);
                }
            }

            // Execute accept
            const mcNumbers = movement.mc_numbers.split(',');
            db.transaction(() => {
                const updateStock = db.prepare(`
                    UPDATE fg_stock_master
                    SET cold_store = ?, status = 'Available', section_id = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE mc_number = ?
                `);
                for (const mc of mcNumbers) {
                    updateStock.run(movement.to_location, mc);
                }
                db.prepare(`
                    UPDATE stock_movement_log
                    SET status = 'Completed'
                    WHERE movement_id = ?
                `).run(transferResult.moveId);
            })();
        };

        // 1. Try acceptance as other manager: should throw Error
        try {
            attemptAccept({ role: 'manager', assigned_stores: ['OtherStore_Z'] });
            console.error('  ❌ Error: Unauthorized manager accepted the transfer successfully!');
        } catch (e: any) {
            console.log(`  ✅ Success: Unauthorized manager blocked. Message: "${e.message}"`);
        }

        // 2. Try acceptance as source manager: should succeed
        try {
            attemptAccept({ role: 'manager', assigned_stores: ['OwnedStore_X'] });
            console.log('  ✅ Success: Source store manager successfully accepted transfer to rented store.');

            // Verify final DB state
            const rentedCount = db.prepare("SELECT COUNT(*) as c FROM fg_stock_master WHERE cold_store = 'RentedStore_Y' AND status = 'Available'").get() as any;
            const logStatus = db.prepare("SELECT status FROM stock_movement_log WHERE movement_id = ?").get(transferResult.moveId) as { status: string };

            if (rentedCount.c === 3 && logStatus.status === 'Completed') {
                console.log('  ✅ Success: Database records updated correctly (Status: Completed, Location: RentedStore_Y).');
            } else {
                console.error(`  ❌ Error: Final database states incorrect. Count: ${rentedCount.c}, Status: ${logStatus.status}`);
            }
        } catch (e: any) {
            console.error(`  ❌ Error: Source manager failed to accept transfer: ${e.message}`);
        }

    } catch (err) {
        console.error('Test Suite Error:', err);
    } finally {
        cleanupTestEnvironment();
        console.log('\n=== Rented Store Transfer Acceptance Verification Complete ===');
    }
}

runRentedTests();
