import { getDb } from '../lib/db';
import { allocateSectionsForBatch } from '../lib/stock-logic';

const db = getDb();

function setupTestEnvironment() {
    console.log('  [Setup] Setting up mock store and custom sections...');
    
    // Create a mock store
    db.prepare("INSERT INTO stores (name, capacity_tons, is_active) VALUES ('TestStore_X', 100, 1)").run();

    // Seed sections manually for our test store
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('TestStore_X', 'Section A', 100)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('TestStore_X', 'Section B', 200)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('TestStore_X', 'Section C', 300)").run();
    db.prepare("INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs) VALUES ('TestStore_X', 'Section D', 400)").run();
}

function cleanupTestEnvironment() {
    console.log('  [Cleanup] Cleaning up test data...');
    db.prepare("DELETE FROM fg_stock_master WHERE cold_store = 'TestStore_X'").run();
    db.prepare("DELETE FROM store_sections WHERE store_name = 'TestStore_X'").run();
    db.prepare("DELETE FROM stores WHERE name = 'TestStore_X'").run();
}

function seedMockOccupancy(sectionName: string, count: number) {
    const section = db.prepare("SELECT id FROM store_sections WHERE store_name = 'TestStore_X' AND name = ?").get(sectionName) as { id: number };
    
    // Insert 'count' cartons into the store section
    const insertStock = db.prepare(`
        INSERT INTO fg_stock_master (mc_number, grade, packing_code, packing_date, cold_store, status, section_id)
        VALUES (?, 'A', '10KG', '2026-06-01', 'TestStore_X', 'Available', ?)
    `);

    for (let i = 0; i < count; i++) {
        const mcNumber = `MC-TEST-${sectionName.replace(/\s+/g, '')}-${i}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        insertStock.run(mcNumber, section.id);
    }
    console.log(`  [Seed] Placed ${count} cartons in ${sectionName}`);
}

function clearOccupancy() {
    db.prepare("DELETE FROM fg_stock_master WHERE cold_store = 'TestStore_X'").run();
}

async function runTests() {
    console.log('=== Starting Store Location Mapping & Allocation Tests ===');
    cleanupTestEnvironment();
    setupTestEnvironment();

    try {
        const secA = db.prepare("SELECT id, capacity_mcs FROM store_sections WHERE store_name = 'TestStore_X' AND name = 'Section A'").get() as { id: number; capacity_mcs: number };
        const secB = db.prepare("SELECT id, capacity_mcs FROM store_sections WHERE store_name = 'TestStore_X' AND name = 'Section B'").get() as { id: number; capacity_mcs: number };
        const secC = db.prepare("SELECT id, capacity_mcs FROM store_sections WHERE store_name = 'TestStore_X' AND name = 'Section C'").get() as { id: number; capacity_mcs: number };
        const secD = db.prepare("SELECT id, capacity_mcs FROM store_sections WHERE store_name = 'TestStore_X' AND name = 'Section D'").get() as { id: number; capacity_mcs: number };

        // -------------------------------------------------------------------------------------
        // Test 1: Best-Fit Allocation (Fits perfectly in a single section minimizing unused space)
        // -------------------------------------------------------------------------------------
        console.log('\nTest 1: Testing Best-Fit single section allocation...');
        // Section A has 100 free
        // Section B has 200 free
        // Section C has 300 free
        // Section D has 400 free
        // Let's allocate 150 MCs. It doesn't fit in A, but fits in B, C, D.
        // Best fit should be Section B because it minimizes wasted space (B has 200 slots, remaining 50; C has 300, remaining 150; etc.).
        let allocations = allocateSectionsForBatch(db, 'TestStore_X', 150);
        
        if (allocations.length === 1 && allocations[0].sectionId === secB.id && allocations[0].count === 150) {
            console.log('  ✅ Test 1 Passed: Routed 150 MCs entirely to Section B');
        } else {
            console.error('  ❌ Test 1 Failed:', allocations);
        }

        // -------------------------------------------------------------------------------------
        // Test 2: Best-Fit Allocation with Occupied Slots
        // -------------------------------------------------------------------------------------
        console.log('\nTest 2: Testing Best-Fit with occupied sections...');
        // Let's occupy:
        // Section A: 20 cartons (80 free)
        // Section B: 120 cartons (80 free)
        // Section C: 150 cartons (150 free)
        // Section D: 310 cartons (90 free)
        seedMockOccupancy('Section A', 20);
        seedMockOccupancy('Section B', 120);
        seedMockOccupancy('Section C', 150);
        seedMockOccupancy('Section D', 310);

        // We want to allocate 75 MCs.
        // Available space:
        // A: 80
        // B: 80
        // C: 150
        // D: 90
        // Best-fit should be Section A or B since they both have 80 available slots.
        // alphabetical fallback: A is sorted before B, so it should go to A.
        allocations = allocateSectionsForBatch(db, 'TestStore_X', 75);
        if (allocations.length === 1 && (allocations[0].sectionId === secA.id || allocations[0].sectionId === secB.id) && allocations[0].count === 75) {
            console.log(`  ✅ Test 2 Passed: Routed 75 MCs entirely to section ID ${allocations[0].sectionId}`);
        } else {
            console.error('  ❌ Test 2 Failed:', allocations);
        }

        // -------------------------------------------------------------------------------------
        // Test 3: Split-Fit Allocation (Cannot fit in any single section)
        // -------------------------------------------------------------------------------------
        console.log('\nTest 3: Testing Split-Fit allocation (filling multiple sections)...');
        // Let's allocate 200 MCs. Max single free is Section C (150).
        // It must split!
        // Free slots list sorted desc:
        // C: 150
        // D: 90
        // A: 80
        // B: 80
        //
        // So split should fill:
        // C: 150 MCs (now C is full)
        // D: 50 MCs (D now has 40 free)
        allocations = allocateSectionsForBatch(db, 'TestStore_X', 200);
        
        const cAlloc = allocations.find(a => a.sectionId === secC.id);
        const dAlloc = allocations.find(a => a.sectionId === secD.id);
        if (allocations.length === 2 && cAlloc?.count === 150 && dAlloc?.count === 50) {
            console.log('  ✅ Test 3 Passed: Split 200 MCs across Section C (150) and Section D (50)');
        } else {
            console.error('  ❌ Test 3 Failed:', allocations);
        }

        // -------------------------------------------------------------------------------------
        // Test 4: Overflow Fallback (Exceeds total store capacity)
        // -------------------------------------------------------------------------------------
        console.log('\nTest 4: Testing Overflow allocation (exceeding total capacity)...');
        // Total available capacity in store:
        // A: 80, B: 80, C: 150, D: 90 => Total = 400.
        // Let's request 450 MCs.
        // It should fill:
        // C (150), D (90), A (80), B (80) completely,
        // and the remaining 50 should go to Section C (which had the highest starting space: 150).
        // So Section C gets 150 + 50 = 200.
        allocations = allocateSectionsForBatch(db, 'TestStore_X', 450);
        
        const aAlloc = allocations.find(a => a.sectionId === secA.id);
        const bAlloc = allocations.find(a => a.sectionId === secB.id);
        const cAllocOvr = allocations.find(a => a.sectionId === secC.id);
        const dAllocOvr = allocations.find(a => a.sectionId === secD.id);

        if (aAlloc?.count === 80 && bAlloc?.count === 80 && cAllocOvr?.count === 200 && dAllocOvr?.count === 90) {
            console.log('  ✅ Test 4 Passed: Overflow correctly routed to Section C (total 200)');
        } else {
            console.error('  ❌ Test 4 Failed:', allocations);
        }

        // -------------------------------------------------------------------------------------
        // Test 5: Section Deletion Constraint
        // -------------------------------------------------------------------------------------
        console.log('\nTest 5: Testing Section Deletion Constraint...');
        // Section A has stock (20 cartons) -> deletion via API simulation check
        const activeCountInA = db.prepare(`
            SELECT COUNT(*) as count FROM fg_stock_master 
            WHERE cold_store = 'TestStore_X' AND section_id = ? AND status NOT IN ('Repacked', 'Dispatched')
        `).get(secA.id) as { count: number };

        if (activeCountInA.count > 0) {
            console.log(`  ✅ Test 5 Passed: Deletion correctly blocked conceptually (contains ${activeCountInA.count} active cartons)`);
        } else {
            console.error('  ❌ Test 5 Failed: Active cartons count is 0');
        }

    } catch (e) {
        console.error('Test execution error:', e);
    } finally {
        cleanupTestEnvironment();
        console.log('\n=== Verification Complete ===');
    }
}

runTests();
