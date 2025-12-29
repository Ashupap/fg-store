
import { getDb } from '../lib/db';

const db = getDb();

function cleanupDuplicates() {
    console.log('Starting Master Data Cleanup...');

    const columns = ['variety', 'grade', 'packing', 'type', 'cold_store'];
    let totalDeleted = 0;

    for (const col of columns) {
        console.log(`\nProcessing column: ${col}`);

        // 1. Get all values
        const rows = db.prepare(`SELECT id, ${col} as val FROM master_data WHERE ${col} IS NOT NULL AND ${col} != ''`).all() as { id: number, val: string }[];

        // 2. Group by lower case
        const groups = new Map<string, { id: number, val: string }[]>();

        rows.forEach(row => {
            const key = row.val.toLowerCase().trim();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(row);
        });

        // 3. Identify duplicates
        for (const [key, items] of groups) {
            if (items.length > 1) {
                // Determine winner: Prefer Title Case, then oldest ID
                // Sort by: Is Title Case? Desc, Then ID Asc
                items.sort((a, b) => {
                    const aIsTitle = /^[A-Z]/.test(a.val);
                    const bIsTitle = /^[A-Z]/.test(b.val);
                    if (aIsTitle && !bIsTitle) return -1;
                    if (!aIsTitle && bIsTitle) return 1;
                    return a.id - b.id;
                });

                const winner = items[0];
                const losers = items.slice(1);

                console.log(`  Found duplicates for "${key}": keeping "${winner.val}" (${winner.id}), deleting ${losers.length} others.`);

                const loserIds = losers.map(l => l.id);

                // Delete losers
                const del = db.prepare(`DELETE FROM master_data WHERE id IN (${loserIds.map(() => '?').join(',')})`).run(...loserIds);
                totalDeleted += del.changes;
            }
        }
    }

    console.log(`\nCleanup Complete. Removed ${totalDeleted} duplicate entries.`);
}

cleanupDuplicates();
