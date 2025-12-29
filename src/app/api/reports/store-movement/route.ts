
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');

        const db = getDb();

        // 1. Get List of Stores (including Production if we want to track it, though usually we track Cold Stores)
        // actually we want to report on "stores".
        // 1. Get List of Stores (Apply RBAC)
        const user = await getCurrentUser();
        const isRestricted = user?.role !== 'admin' && user?.role !== 'general_manager'; // Only Admins & GMs see all.
        const allowedNames = user?.assigned_store_names || [];

        let storesQuery = "SELECT DISTINCT cold_store FROM master_data WHERE cold_store IS NOT NULL AND cold_store != ''";
        let storesParams: any[] = [];

        if (isRestricted) {
            if (allowedNames.length === 0) return NextResponse.json({ success: true, data: [] });
            const placeholders = allowedNames.map(() => '?').join(',');
            storesQuery += ` AND cold_store IN (${placeholders})`;
            storesParams.push(...allowedNames);
        }

        const stores = db.prepare(storesQuery).all(...storesParams) as { cold_store: string }[];

        // 2. Calculate Sent/Received from Log
        let dateFilter = '';
        const params: any[] = [];

        if (fromDate) {
            dateFilter += " AND movement_datetime >= ?";
            params.push(fromDate);
        }
        if (toDate) {
            dateFilter += " AND movement_datetime <= ?";
            params.push(toDate + ' 23:59:59');
        }

        // Received: INWARD (to_location), TRANSFER (to_location), RETURN (to_location = store [now supported])
        // We group by to_location
        // Exclude empty locations (e.g. data issues)
        const receivedQuery = `
            SELECT to_location as store, SUM(qty_mcs) as total_received 
            FROM stock_movement_log 
            WHERE status = 'Completed' AND to_location IS NOT NULL AND to_location != '' ${dateFilter}
            GROUP BY to_location
        `;
        const receivedData = db.prepare(receivedQuery).all(...params) as { store: string, total_received: number }[];

        // Sent: TRANSFER (from_location), RETURN (from_location), DISPATCH (from_location)
        // We group by from_location
        const sentQuery = `
            SELECT from_location as store, SUM(qty_mcs) as total_sent
            FROM stock_movement_log 
            WHERE status IN ('Completed', 'In Transit') AND from_location IS NOT NULL AND from_location != '' ${dateFilter}
            GROUP BY from_location
        `;
        const sentData = db.prepare(sentQuery).all(...params) as { store: string, total_sent: number }[];

        // 3. Get Current Balance from Stock Master
        // Exclude 'In Transit' from balance report if we only want physical stores, 
        // but 'In Transit' is technically a location. 
        // Let's keep it if it shows up in master, but ensure no blanks.
        const balanceQuery = `
            SELECT cold_store as store, COUNT(*) as current_balance
            FROM fg_stock_master
            WHERE status = 'Available' AND cold_store IS NOT NULL AND cold_store != ''
            GROUP BY cold_store
        `;
        const balanceData = db.prepare(balanceQuery).all() as { store: string, current_balance: number }[];

        // 4. Merge Data
        const reportMap = new Map<string, { store: string, sent: number, received: number, balance: number }>();

        // Init with known stores (only valid ones)
        stores.forEach(s => {
            if (s.cold_store && s.cold_store.trim() !== '') {
                reportMap.set(s.cold_store, { store: s.cold_store, sent: 0, received: 0, balance: 0 });
            }
        });

        // Merge Received
        receivedData.forEach(r => {
            if (!r.store || r.store.trim() === '') return;
            // Option: We could filter out Clients here by checking if r.store is in a known list?
            // For now, let's just ensure no blanks.
            if (!reportMap.has(r.store)) reportMap.set(r.store, { store: r.store, sent: 0, received: 0, balance: 0 });
            const entry = reportMap.get(r.store)!;
            entry.received = r.total_received;
        });

        // Merge Sent
        sentData.forEach(s => {
            if (!s.store || s.store.trim() === '') return;
            if (!reportMap.has(s.store)) reportMap.set(s.store, { store: s.store, sent: 0, received: 0, balance: 0 });
            const entry = reportMap.get(s.store)!;
            entry.sent = s.total_sent;
        });

        // Merge Balance
        balanceData.forEach(b => {
            if (!b.store || b.store.trim() === '') return;
            if (!reportMap.has(b.store)) reportMap.set(b.store, { store: b.store, sent: 0, received: 0, balance: 0 });
            const entry = reportMap.get(b.store)!;
            entry.balance = b.current_balance;
        });

        // Filter out specific non-store keywords if they clutter (like "In Transit" or Client Names if necessary)
        // For now, strictly filtering blanks.
        const report = Array.from(reportMap.values())
            .filter(r => r.store && r.store.trim() !== '' && r.store !== 'In Transit'); // Optional: hide In Transit from store report? likely yes.


        return NextResponse.json({
            success: true,
            data: report
        });

    } catch (error) {
        console.error('Store Report Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate store report' }, { status: 500 });
    }
}
