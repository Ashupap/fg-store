import { getDb } from '@/lib/db';
import { generateMovementId, generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema } from '@/lib/validations';
import type { MovementResult } from '@/types';
import { processGlobalPendingAllocations } from '@/lib/allocation';

// Handle INWARD movement - Production to Store
export async function handleInward(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    console.log('[StockLogic] Handling Inward:', JSON.stringify(data));
    const validation = inwardMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error as any;
        console.error('[StockLogic] Inward Validation Error:', JSON.stringify(error));
        return { success: false, error: error.errors?.[0]?.message || 'Validation failed' };
    }

    const { toStore, type, variety, packing, grade, qty, remarks, barcodes } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();
    const packingCode = packingToCode(packing);
    const packingDate = formatDate(new Date());

    if (barcodes && barcodes.length !== qty) {
        return { success: false, error: `Barcode count (${barcodes.length}) does not match quantity (${qty})` };
    }

    const mcNumbers: string[] = [];

    const insertStock = db.prepare(`
    INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id, barcode)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?)
  `);

    const insertMovement = db.prepare(`
    INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, remarks, status)
    VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
  `);

    const updateMovementStatus = db.prepare(`
        UPDATE stock_movement_log 
        SET status = 'Completed', mc_numbers = ?, approved_by_id = ?
        WHERE movement_id = ?
    `);

    const transaction = db.transaction(() => {
        // Generate MC numbers and insert stock records
        // Optimization: Get start sequence once and increment locally to avoid DB round-trips and sorting issues
        let currentSeq = getNextMCSequence(db, grade, packingCode);

        for (let i = 0; i < qty; i++) {
            const mcNumber = generateMCNumber(grade, packingCode, currentSeq);
            mcNumbers.push(mcNumber);
            const barcode = barcodes ? barcodes[i] : null;

            insertStock.run(mcNumber, grade, variety, type, packingCode, packingDate, toStore, userId, barcode);
            currentSeq++;
        }

        if (existingMovementId) {
            // Update existing pending log
            updateMovementStatus.run(mcNumbers.join(','), userId, movementId);
        } else {
            // Log new movement
            insertMovement.run(
                movementId,
                new Date().toISOString(),
                toStore,
                type,
                variety,
                packing,
                grade,
                mcNumbers.join(','),
                qty,
                userId,
                remarks || null
            );
        }
    });

    try {
        transaction();

        // Auto-allocate to pending POs
        try {
            processGlobalPendingAllocations();
        } catch (allocError) {
            console.error('Auto-allocation (Inward) failed:', allocError);
            // Don't fail the inward movement just because auto-alloc failed
        }

        return {
            success: true,
            moveId: movementId,
            movedCount: qty,
        };
    } catch (error: any) {
        console.error('Inward transaction error:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes('barcode')) {
            return { success: false, error: 'One or more scanned barcodes already exist in the system.' };
        }
        return { success: false, error: 'Failed to process inward movement' };
    }
}

// Handle TRANSFER movement - Store to Store
export async function handleTransfer(data: unknown, userId: number, existingMovementId?: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    console.log('[StockLogic] Handling Transfer:', JSON.stringify(data));
    const validation = transferMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error as any;
        console.error('[StockLogic] Transfer Validation Error:', JSON.stringify(error));
        return { success: false, error: error.errors?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, type, variety, packing, grade, qty } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();
    const packingCode = packingToCode(packing);

    let availableMCs: { id: number; mc_number: string }[] = [];

    if (specificMCNumbers && specificMCNumbers.length > 0) {
        // Validate specific MCs
        if (specificMCNumbers.length !== qty) {
            return { success: false, error: `Scan count (${specificMCNumbers.length}) does not match requested quantity (${qty})` };
        }

        // Fetch these specific MCs to ensure they are valid and in range
        const placeholders = specificMCNumbers.map(() => '?').join(',');
        const stocks = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master
            WHERE mc_number IN (${placeholders}) 
            AND cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
        `).all(...specificMCNumbers, fromStore, type, variety, packingCode, grade) as { id: number; mc_number: string }[];

        if (stocks.length !== specificMCNumbers.length) {
            return { success: false, error: 'Some scanned MCs are invalid or not available in the selected store' };
        }
        availableMCs = stocks;
    } else {
        // FIFO Selection
        availableMCs = db.prepare(`
        SELECT id, mc_number FROM fg_stock_master
        WHERE cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
        ORDER BY packing_date ASC
        LIMIT ?
      `).all(fromStore, type, variety, packingCode, grade, qty) as { id: number; mc_number: string }[];
    }

    if (availableMCs.length === 0) {
        return { success: false, error: 'No available stock found matching the criteria' };
    }

    const mcNumbers = availableMCs.map(mc => mc.mc_number);
    const mcIds = availableMCs.map(mc => mc.id);
    const movedCount = availableMCs.length;
    const notMoved: string[] = [];

    if (movedCount < qty) {
        notMoved.push(`Only ${movedCount} MCs available out of ${qty} requested`);
    }

    const updateStock = db.prepare(`
    UPDATE fg_stock_master 
    SET cold_store = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

    const insertMovement = db.prepare(`
    INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status)
    VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const updateMovementStatus = db.prepare(`
        UPDATE stock_movement_log 
        SET status = ?, mc_numbers = ?, approved_by_id = ?
        WHERE movement_id = ?
    `);

    const status = movedCount < qty ? 'Partial' : 'In Transit';

    const transaction = db.transaction(() => {
        // Update each MC's cold store to 'In Transit'
        for (const id of mcIds) {
            updateStock.run('In Transit', id);
        }

        if (existingMovementId) {
            updateMovementStatus.run(status, mcNumbers.join(','), userId, movementId);
        } else {
            insertMovement.run(
                movementId,
                new Date().toISOString(),
                fromStore,
                toStore,
                type,
                variety,
                packing,
                grade,
                mcNumbers.join(','),
                movedCount,
                userId,
                status
            );
        }
    });

    try {
        transaction();
        return {
            success: true,
            moveId: movementId,
            movedCount,
            notMoved: notMoved.length > 0 ? notMoved : undefined,
        };
    } catch (error) {
        console.error('Transfer transaction error:', error);
        return { success: false, error: 'Failed to process transfer movement' };
    }
}

// Handle DISPATCH movement - Store to Client/Exit
export async function handleDispatch(data: unknown, userId: number, existingMovementId?: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    console.log('[StockLogic] Handling Dispatch:', JSON.stringify(data));
    const validation = dispatchMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error as any;
        console.error('[StockLogic] Dispatch Validation Error:', JSON.stringify(error));
        return { success: false, error: error.errors?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, type, variety, packing, grade, qty, dispatchPurpose, poId } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();
    const packingCode = packingToCode(packing);

    let availableMCs: { id: number; mc_number: string }[] = [];

    if (specificMCNumbers && specificMCNumbers.length > 0) {
        // Validate specific MCs
        if (specificMCNumbers.length !== qty) {
            return { success: false, error: `Scan count (${specificMCNumbers.length}) does not match requested quantity (${qty})` };
        }

        const placeholders = specificMCNumbers.map(() => '?').join(',');
        const stocks = db.prepare(`
            SELECT id, mc_number FROM fg_stock_master
            WHERE mc_number IN (${placeholders}) 
            AND cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
        `).all(...specificMCNumbers, fromStore, type, variety, packingCode, grade) as { id: number; mc_number: string }[];

        if (stocks.length !== specificMCNumbers.length) {
            return { success: false, error: 'Some scanned MCs are invalid or not available in the selected store' };
        }
        availableMCs = stocks;
    } else {
        // FIFO Selection
        availableMCs = db.prepare(`
        SELECT id, mc_number FROM fg_stock_master
        WHERE cold_store = ? AND type = ? AND variety = ? AND packing_code = ? AND grade = ? AND status = 'Available'
        ORDER BY packing_date ASC
        LIMIT ?
      `).all(fromStore, type, variety, packingCode, grade, qty) as { id: number; mc_number: string }[];
    }

    if (availableMCs.length === 0) {
        return { success: false, error: 'No available stock found matching the criteria' };
    }

    const mcNumbers = availableMCs.map(mc => mc.mc_number);
    const mcIds = availableMCs.map(mc => mc.id);
    const movedCount = availableMCs.length;
    const notMoved: string[] = [];

    if (movedCount < qty) {
        notMoved.push(`Only ${movedCount} MCs available out of ${qty} requested`);
    }

    let finalRemarks = `Purpose: ${dispatchPurpose}`;
    let poNumber = '';

    if (dispatchPurpose === 'SALE' && poId) {
        // Fetch PO Number
        const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(poId) as { po_number: string };
        if (po) {
            poNumber = po.po_number;
            finalRemarks += `, PO: ${poNumber}`;
        }
    }

    // Update stock: Mark as Dispatched and remove from Cold Store list
    const updateStock = db.prepare(`
    UPDATE fg_stock_master 
    SET status = 'Dispatched', cold_store = 'Dispatch', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

    const insertMovement = db.prepare(`
    INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status, remarks)
    VALUES (?, ?, 'DISPATCH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const updateMovementStatus = db.prepare(`
        UPDATE stock_movement_log 
        SET status = ?, mc_numbers = ?, approved_by_id = ?
        WHERE movement_id = ?
    `);

    // Optional: Update PO status if it's a sale
    const updatePOStatus = db.prepare("UPDATE purchase_orders SET status = 'Dispatched' WHERE id = ?");

    const status = movedCount < qty ? 'Partial' : 'Completed';

    const transaction = db.transaction(() => {
        // Update each MC
        for (const id of mcIds) {
            updateStock.run(id);
        }

        // If Sale & PO Linked, mark PO as dispatched (Simplistic logic for now)
        if (dispatchPurpose === 'SALE' && poId) {
            updatePOStatus.run(poId);
        }

        if (existingMovementId) {
            updateMovementStatus.run(status, mcNumbers.join(','), userId, movementId);
        } else {
            insertMovement.run(
                movementId,
                new Date().toISOString(),
                fromStore,
                toStore, // Client Name / Destination
                type,
                variety,
                packing,
                grade,
                mcNumbers.join(','),
                movedCount,
                userId,
                status,
                finalRemarks
            );
        }
    });

    try {
        transaction();
        return {
            success: true,
            moveId: movementId,
            movedCount,
            notMoved: notMoved.length > 0 ? notMoved : undefined,
        };
    } catch (error) {
        console.error('Dispatch transaction error:', error);
        return { success: false, error: 'Failed to process dispatch' };
    }
}
