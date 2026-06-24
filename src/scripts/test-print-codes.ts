import { getDb } from '../lib/db';
import { handleInward } from '../lib/stock-logic';

const db = getDb();

function setupStore() {
    // Ensure TestStore_Print exists in stores table
    db.prepare("INSERT OR IGNORE INTO stores (name, capacity_tons) VALUES ('TestStore_Print', 100)").run();
}

function cleanup() {
    db.prepare("DELETE FROM fg_stock_master WHERE cold_store = 'TestStore_Print'").run();
    db.prepare("DELETE FROM stock_movement_log WHERE to_location = 'TestStore_Print'").run();
    db.prepare("DELETE FROM stores WHERE name = 'TestStore_Print'").run();
}

async function testSequenceCodesAndPrintDetail() {
    console.log('=== Starting Sequential Code Printout Unit Test ===');
    cleanup();
    setupStore();

    try {
        // 1. Create a dummy inward movement of 5 cartons
        console.log('\nTest 1: Inwarding 5 cartons and checking generated short codes...');
        const inwardData = {
            toStore: 'TestStore_Print',
            type: 'TestType',
            variety: 'PrintVariety',
            packing: '10kg Carton',
            grade: 'AA',
            qty: 5,
            remarks: 'Testing print codes'
        };

        const result = await handleInward(inwardData, 1); // 1 = Admin User ID
        if (!result.success) {
            throw new Error(`Inward failed: ${result.error}`);
        }

        console.log('  ✅ Inward completed successfully.');
        console.log(`  Movement ID: ${result.moveId}`);
        console.log(`  Short Codes Generated: [${result.shortCodes?.join(', ')}]`);

        if (!result.shortCodes || result.shortCodes.length !== 5) {
            throw new Error(`Expected 5 short codes, got ${result.shortCodes?.length}`);
        }

        // Verify that the generated codes are indeed 3 characters
        result.shortCodes.forEach(code => {
            if (code.length !== 3) {
                throw new Error(`Short code ${code} is not 3 characters!`);
            }
        });
        console.log('  ✅ All generated short codes are exactly 3 characters.');

        // 2. Fetch the movement log and cartons like the /api/movement/[id] endpoint does
        console.log('\nTest 2: Simulating API fetch for print-codes page...');
        const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(result.moveId) as any;
        if (!movement) {
            throw new Error('Movement log not found in database');
        }

        let cartons: any[] = [];
        if (movement.mc_numbers) {
            const mcList = movement.mc_numbers.split(',').map((mc: string) => mc.trim());
            const placeholders = mcList.map(() => '?').join(',');
            cartons = db.prepare(`
                SELECT mc_number, short_code, barcode, grade, variety, type, packing_code, status
                FROM fg_stock_master
                WHERE mc_number IN (${placeholders})
            `).all(...mcList);
        }

        console.log(`  Movement Action Type: ${movement.action_type}`);
        console.log(`  Number of Cartons Fetched: ${cartons.length}`);
        
        if (cartons.length !== 5) {
            throw new Error(`Expected 5 cartons, fetched ${cartons.length}`);
        }

        cartons.forEach((carton, idx) => {
            console.log(`    Carton ${idx + 1}: MC=${carton.mc_number}, ShortCode=${carton.short_code}, Barcode=${carton.barcode}`);
            if (!carton.short_code) {
                throw new Error(`Carton ${carton.mc_number} is missing its short code!`);
            }
            if (carton.barcode !== carton.short_code) {
                throw new Error(`Expected barcode to fallback to short code, got barcode=${carton.barcode}`);
            }
        });

        console.log('  ✅ Carton detail simulation passed.');
        console.log('  ✅ All verification assertions passed successfully.');

    } catch (error: any) {
        console.error('  ❌ Test Failed:', error.message || error);
    } finally {
        cleanup();
        console.log('\n=== Sequential Code Printout Unit Test Complete ===');
    }
}

testSequenceCodesAndPrintDetail();
