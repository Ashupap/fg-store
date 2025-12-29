
import { getDb } from '../lib/db';

const db = getDb();

function verifyRBACQueries() {
    console.log('Verifying RBAC SQL Queries...');

    // 1. Movement History Query (Mock User with Stores ['Store A'])
    const allowedStores = ['Store A'];
    const placeholders = allowedStores.map(() => '?').join(',');
    const whereClause = `WHERE 1=1 AND (sml.from_location IN (${placeholders}) OR sml.to_location IN (${placeholders}))`;

    try {
        const query = `
            SELECT sml.movement_id 
            FROM stock_movement_log sml
            ${whereClause}
            LIMIT 1
        `;
        db.prepare(query).all(...allowedStores, ...allowedStores);
        console.log('✅ Movement History Query: Syntax Valid');
    } catch (e) {
        console.error('❌ Movement History Query Failed:', e);
    }

    // 2. Report Query
    try {
        const reportQuery = `SELECT DISTINCT cold_store FROM master_data WHERE cold_store IS NOT NULL AND cold_store IN (${placeholders})`;
        db.prepare(reportQuery).all(...allowedStores);
        console.log('✅ Report Store List Query: Syntax Valid');
    } catch (e) {
        console.error('❌ Report Query Failed:', e);
    }

    // 3. Stock List Query
    try {
        const stockQuery = `
            SELECT cold_store, COUNT(*) as stock
            FROM fg_stock_master
            WHERE status = 'Available' AND cold_store IN (${placeholders})
            GROUP BY cold_store
        `;
        db.prepare(stockQuery).all(...allowedStores);
        console.log('✅ Stock List Query: Syntax Valid');
    } catch (e) {
        console.error('❌ Stock List Query Failed:', e);
    }
}

verifyRBACQueries();
