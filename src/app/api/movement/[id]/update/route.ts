import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema } from '@/lib/validations';
import { generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import { generateShortCodesBlock } from '@/lib/stock-logic';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'transaction:update')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const { change_reason, ...updates } = body;

        if (!change_reason || typeof change_reason !== 'string' || change_reason.trim() === '') {
            return NextResponse.json({ success: false, error: 'A change reason is required' }, { status: 400 });
        }

        const db = getDb();

        // Start database transaction
        let beforeStateStr = '';
        let errorMsg = '';

        const transaction = db.transaction(() => {
            // 1. Fetch current movement log
            const log = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(id) as any;
            if (!log) {
                errorMsg = 'Movement log not found';
                throw new Error(errorMsg);
            }

            if (!['INWARD', 'TRANSFER', 'DISPATCH'].includes(log.action_type)) {
                errorMsg = `Editing ${log.action_type} transactions is not supported`;
                throw new Error(errorMsg);
            }

            // 2. Fetch current stock records matching mc_numbers
            const oldMcNumbers = log.mc_numbers ? log.mc_numbers.split(',') : [];
            let beforeStock: any[] = [];
            if (oldMcNumbers.length > 0) {
                const placeholders = oldMcNumbers.map(() => '?').join(',');
                beforeStock = db.prepare(
                    `SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`
                ).all(...oldMcNumbers) as any[];
            }

            // Snapshot the state before changes
            beforeStateStr = JSON.stringify({ log, stock: beforeStock });

            // 3. Rollback the old transaction state
            if (log.action_type === 'INWARD') {
                // Assert that all created MCs are still Available and in the destination store
                const unavailable = beforeStock.some(
                    s => s.status !== 'Available' || s.cold_store !== log.to_location
                );
                if (unavailable) {
                    errorMsg = 'Cannot edit Inward: some cartons are no longer Available in the destination store';
                    throw new Error(errorMsg);
                }

                // Delete the stock master records
                if (oldMcNumbers.length > 0) {
                    const placeholders = oldMcNumbers.map(() => '?').join(',');
                    db.prepare(`DELETE FROM fg_stock_master WHERE mc_number IN (${placeholders})`).run(...oldMcNumbers);
                }
            } else if (log.action_type === 'TRANSFER') {
                // Assert that all moved MCs are still Available (can be In Transit or at the to_location)
                const unavailable = beforeStock.some(
                    s => s.status !== 'Available' || (s.cold_store !== log.to_location && s.cold_store !== 'In Transit')
                );
                if (unavailable) {
                    errorMsg = 'Cannot edit Transfer: some cartons are no longer Available or have been moved';
                    throw new Error(errorMsg);
                }

                // Revert locations to the original source store and set status to Available
                if (oldMcNumbers.length > 0) {
                    const placeholders = oldMcNumbers.map(() => '?').join(',');
                    db.prepare(
                        `UPDATE fg_stock_master SET cold_store = ?, status = 'Available' WHERE mc_number IN (${placeholders})`
                    ).run(log.from_location, ...oldMcNumbers);
                }
            } else if (log.action_type === 'DISPATCH') {
                // Assert that all dispatched MCs are still Dispatched
                const unavailable = beforeStock.some(
                    s => s.status !== 'Dispatched' || s.cold_store !== 'Dispatch'
                );
                if (unavailable) {
                    errorMsg = 'Cannot edit Dispatch: some cartons are no longer in Dispatch status';
                    throw new Error(errorMsg);
                }

                // Revert locations back to the original source store and set status to appropriate reserved status
                if (oldMcNumbers.length > 0) {
                    const placeholders = oldMcNumbers.map(() => '?').join(',');
                    const poFull = db.prepare('SELECT branding_type FROM purchase_orders WHERE id = ?').get(log.po_id) as { branding_type: string } | undefined;
                    const requiredStatus = poFull?.branding_type === 'Branded' ? 'Allocated' : 'Reserved';

                    db.prepare(
                        `UPDATE fg_stock_master SET cold_store = ?, status = ? WHERE mc_number IN (${placeholders})`
                    ).run(log.from_location, requiredStatus, ...oldMcNumbers);
                }
            }

            // 4. Validate and Execute the new transaction state
            const mergedInput = {
                ...log,
                ...updates,
                qty: Number(updates.qty_mcs !== undefined ? updates.qty_mcs : log.qty_mcs),
                toStore: updates.to_location !== undefined ? updates.to_location : log.to_location,
                fromStore: updates.from_location !== undefined ? updates.from_location : log.from_location,
                dispatchPurpose: updates.dispatch_purpose !== undefined ? updates.dispatch_purpose : log.dispatch_purpose,
                poId: updates.po_id !== undefined ? Number(updates.po_id) : log.po_id,
                allocationStrategy: updates.allocation_strategy !== undefined ? updates.allocation_strategy : log.allocation_strategy,
            };

            let newMcNumbers: string[] = [];

            if (log.action_type === 'INWARD') {
                const validation = inwardMovementSchema.safeParse(mergedInput);
                if (!validation.success) {
                    errorMsg = validation.error.issues[0]?.message || 'Validation failed';
                    throw new Error(errorMsg);
                }

                const valid = validation.data;
                const packingCode = packingToCode(valid.packing);
                const packingDate = valid.packingDate || log.movement_datetime.split('T')[0];

                let currentSeq = getNextMCSequence(db, valid.grade, packingCode);
                const generatedShortCodes = generateShortCodesBlock(db, valid.qty);

                const insertStock = db.prepare(`
                    INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id, barcode, short_code)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?)
                `);

                for (let i = 0; i < valid.qty; i++) {
                    const mcNumber = generateMCNumber(valid.grade, packingCode, currentSeq);
                    newMcNumbers.push(mcNumber);
                    const shortCode = generatedShortCodes[i];
                    const barcode = valid.barcodes ? valid.barcodes[i] : shortCode;
                    insertStock.run(mcNumber, valid.grade, valid.variety, valid.type, packingCode, packingDate, valid.toStore, log.moved_by_id, barcode, shortCode);
                    currentSeq++;
                }

                // Update movement log
                db.prepare(`
                    UPDATE stock_movement_log
                    SET variety = ?, grade = ?, packing = ?, type = ?, qty_mcs = ?, to_location = ?, mc_numbers = ?, remarks = ?
                    WHERE movement_id = ?
                `).run(
                    valid.variety, valid.grade, valid.packing, valid.type, valid.qty, valid.toStore,
                    newMcNumbers.join(','), valid.remarks || null, id
                );

            } else if (log.action_type === 'TRANSFER') {
                const validation = transferMovementSchema.safeParse(mergedInput);
                if (!validation.success) {
                    errorMsg = validation.error.issues[0]?.message || 'Validation failed';
                    throw new Error(errorMsg);
                }

                const valid = validation.data;
                const packingCode = packingToCode(valid.packing);

                // Select cartons using FIFO or LIFO
                const orderDirection = valid.allocationStrategy === 'LIFO' ? 'DESC' : 'ASC';
                const available = db.prepare(`
                    SELECT id, mc_number FROM fg_stock_master
                    WHERE cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
                    ORDER BY packing_date ${orderDirection}
                    LIMIT ?
                `).all(valid.fromStore, valid.type, valid.variety, packingCode, valid.grade, valid.qty) as { id: number; mc_number: string }[];

                if (available.length < valid.qty) {
                    errorMsg = `Insufficient stock available in source store. Requested ${valid.qty}, but only ${available.length} available.`;
                    throw new Error(errorMsg);
                }

                newMcNumbers = available.map(x => x.mc_number);

                // Update the selected cartons to destination cold_store
                const targetStore = log.status === 'Completed' ? valid.toStore : 'In Transit';
                const updateStock = db.prepare('UPDATE fg_stock_master SET cold_store = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
                for (const item of available) {
                    updateStock.run(targetStore, item.id);
                }

                // Update movement log
                db.prepare(`
                    UPDATE stock_movement_log
                    SET variety = ?, grade = ?, packing = ?, type = ?, qty_mcs = ?, from_location = ?, to_location = ?, mc_numbers = ?, remarks = ?, allocation_strategy = ?
                    WHERE movement_id = ?
                `).run(
                    valid.variety, valid.grade, valid.packing, valid.type, valid.qty, valid.fromStore, valid.toStore,
                    newMcNumbers.join(','), valid.remarks || null, valid.allocationStrategy, id
                );

            } else if (log.action_type === 'DISPATCH') {
                const validation = dispatchMovementSchema.safeParse(mergedInput);
                if (!validation.success) {
                    errorMsg = validation.error.issues[0]?.message || 'Validation failed';
                    throw new Error(errorMsg);
                }

                const valid = validation.data;

                // Query PO details
                const po = db.prepare('SELECT po_number, customer FROM purchase_orders WHERE id = ?').get(valid.poId) as { po_number: string; customer: string } | undefined;
                if (!po) {
                    errorMsg = 'PO not found';
                    throw new Error(errorMsg);
                }

                const poFull = db.prepare('SELECT branding_type FROM purchase_orders WHERE id = ?').get(valid.poId) as { branding_type: string } | undefined;
                const requiredStatus = poFull?.branding_type === 'Branded' ? 'Allocated' : 'Reserved';

                // Select cartons reserved/allocated for this PO in this store
                const available = db.prepare(`
                    SELECT id, mc_number, type, variety, packing_code, grade FROM fg_stock_master
                    WHERE cold_store = ? AND reserved_for_po = ? AND status = ?
                    ORDER BY packing_date ASC
                    LIMIT ?
                `).all(valid.fromStore, po.po_number, requiredStatus, valid.qty) as { id: number; mc_number: string; type: string; variety: string; packing_code: string; grade: string }[];

                if (available.length < valid.qty) {
                    errorMsg = `Insufficient stock available for this PO in source store. Requested ${valid.qty}, but only ${available.length} available.`;
                    throw new Error(errorMsg);
                }

                newMcNumbers = available.map(x => x.mc_number);

                // Update cartons to Dispatched status
                const updateStock = db.prepare("UPDATE fg_stock_master SET status = 'Dispatched', cold_store = 'Dispatch', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                for (const item of available) {
                    updateStock.run(item.id);
                }

                // Update movement log
                let finalRemarks = `PO: ${po.po_number}`;
                if (valid.remarks) finalRemarks += ` - ${valid.remarks}`;

                const sampleCarton = available[0] || {};

                db.prepare(`
                    UPDATE stock_movement_log
                    SET variety = ?, grade = ?, packing = ?, type = ?, qty_mcs = ?, from_location = ?, to_location = ?, mc_numbers = ?, remarks = ?, dispatch_purpose = ?, po_id = ?
                    WHERE movement_id = ?
                `).run(
                    sampleCarton.variety || 'Unknown',
                    sampleCarton.grade || 'Unknown',
                    sampleCarton.packing_code || 'Unknown',
                    sampleCarton.type || 'Unknown',
                    valid.qty,
                    valid.fromStore,
                    valid.toStore,
                    newMcNumbers.join(','),
                    finalRemarks,
                    valid.dispatchPurpose || 'SALE',
                    valid.poId,
                    id
                );
            }

            // 5. Get the updated log and stock records for after_state
            const afterLog = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(id) as any;
            let afterStock: any[] = [];
            if (newMcNumbers.length > 0) {
                const placeholders = newMcNumbers.map(() => '?').join(',');
                afterStock = db.prepare(
                    `SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`
                ).all(...newMcNumbers) as any[];
            }

            const afterStateStr = JSON.stringify({ log: afterLog, stock: afterStock });

            // 6. Insert audit log record
            db.prepare(`
                INSERT INTO audit_logs (action_type, table_name, record_id, before_state, after_state, changed_by_id, changed_by_name, change_reason)
                VALUES ('UPDATE_TRANSACTION', 'stock_movement_log', ?, ?, ?, ?, ?, ?)
            `).run(id, beforeStateStr, afterStateStr, user.id, user.name, change_reason);
        });

        try {
            transaction();
            return NextResponse.json({ success: true, message: 'Transaction updated and audited successfully' });
        } catch (txError: any) {
            console.error('Update transaction failed:', txError);
            return NextResponse.json({ success: false, error: errorMsg || txError.message || 'Transaction failed to apply' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Update request error:', error);
        return NextResponse.json({ success: false, error: 'Failed to process transaction update' }, { status: 500 });
    }
}
