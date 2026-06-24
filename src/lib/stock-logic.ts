import { getDb } from '@/lib/db';
import { generateMovementId, generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema, repackStartSchema, repackCompleteSchema } from '@/lib/validations';
import type { MovementResult } from '@/types';
import { processGlobalPendingAllocations } from '@/lib/allocation';
import type { CartonRow, StockMasterRow, PendingMovementRow } from '@/lib/db-types';

// Handle INWARD movement - Production to Store
export async function handleInward(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    console.log('[StockLogic] Handling Inward:', JSON.stringify(data));
    const validation = inwardMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error;
        console.error('[StockLogic] Inward Validation Error:', JSON.stringify(error));
        return { success: false, error: error.issues?.[0]?.message || 'Validation failed' };
    }

    const { toStore, type, variety, packing, grade, qty, remarks, barcodes, packingDate: customPackingDate } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();
    const packingCode = packingToCode(packing);
    const packingDate = customPackingDate || formatDate(new Date());

    if (barcodes && barcodes.length !== qty) {
        return { success: false, error: `Barcode count (${barcodes.length}) does not match quantity (${qty})` };
    }

    const mcNumbers: string[] = [];
    const shortCodes: string[] = [];

    const insertStock = db.prepare(`
    INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id, barcode, short_code, section_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?, ?)
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
        const generatedShortCodes = generateShortCodesBlock(db, qty);

        const settingVal = db.prepare("SELECT value FROM settings WHERE key = 'enable_location_mapping'").get() as { value: string } | undefined;
        const useMapping = settingVal?.value === 'true';

        const allocations = useMapping ? allocateSectionsForBatch(db, toStore, qty) : [];
        let allocationIdx = 0;
        let allocatedCount = 0;

        for (let i = 0; i < qty; i++) {
            const mcNumber = generateMCNumber(grade, packingCode, currentSeq);
            mcNumbers.push(mcNumber);
            const shortCode = generatedShortCodes[i];
            shortCodes.push(shortCode);
            const barcode = barcodes ? barcodes[i] : shortCode;

            let currentSectionId = null;
            if (useMapping && allocations.length > 0) {
                if (allocatedCount >= allocations[allocationIdx].count) {
                    allocationIdx++;
                    allocatedCount = 0;
                }
                currentSectionId = allocations[allocationIdx].sectionId;
                allocatedCount++;
            }

            insertStock.run(mcNumber, grade, variety, type, packingCode, packingDate, toStore, userId, barcode, shortCode, currentSectionId);
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
            shortCodes,
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
        const error = validation.error;
        console.error('[StockLogic] Transfer Validation Error:', JSON.stringify(error));
        return { success: false, error: error.issues?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, type, variety, packing, grade, qty, allocationStrategy } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();

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

    const transaction = db.transaction(() => {
        let availableMCs: any[] = [];

        if (specificMCNumbers && specificMCNumbers.length > 0) {
            if (specificMCNumbers.length !== qty) {
                throw new Error(`Scan count (${specificMCNumbers.length}) does not match requested quantity (${qty})`);
            }

            const filteredCartons = getAvailableCartons(db, fromStore, { type, variety, packing, grade }, existingMovementId);
            const stocks = filteredCartons.filter(c => specificMCNumbers.includes(c.mc_number));

            if (stocks.length !== specificMCNumbers.length) {
                throw new Error('Some scanned MCs are invalid, already reserved for pending requests, or not available in the selected store');
            }
            availableMCs = stocks;
        } else {
            const filteredCartons = getAvailableCartons(db, fromStore, { type, variety, packing, grade }, existingMovementId);
            // Sort based on strategy
            if (allocationStrategy === 'LIFO') {
                filteredCartons.sort((a, b) => new Date(b.packing_date).getTime() - new Date(a.packing_date).getTime());
            } else {
                // Default FIFO
                filteredCartons.sort((a, b) => new Date(a.packing_date).getTime() - new Date(b.packing_date).getTime());
            }
            availableMCs = filteredCartons.slice(0, qty);
        }

        if (availableMCs.length === 0) {
            throw new Error('No available stock found matching the criteria');
        }

        const mcNumbers = availableMCs.map(mc => mc.mc_number);
        const mcIds = availableMCs.map(mc => mc.id);
        const movedCount = availableMCs.length;

        // Update each MC's cold store to 'In Transit'
        for (const id of mcIds) {
            updateStock.run('In Transit', id);
        }

        const status = movedCount < qty ? 'Partial' : 'In Transit';

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

        return {
            moveId: movementId,
            movedCount,
        };
    });

    try {
        const result = transaction();
        return {
            success: true,
            ...result,
        };
    } catch (error: any) {
        console.error('Transfer transaction error:', error);
        return { success: false, error: error.message || 'Failed to process transfer movement' };
    }
}

// Handle DISPATCH movement - Store to Client/Exit
export async function handleDispatch(data: unknown, userId: number, existingMovementId?: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    console.log('[StockLogic] Handling Dispatch:', JSON.stringify(data));
    const validation = dispatchMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error;
        console.error('[StockLogic] Dispatch Validation Error:', JSON.stringify(error));
        return { success: false, error: error.issues?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, qty, poId, remarks } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();

    if (!poId) {
        return { success: false, error: 'PO is required for dispatches' };
    }

    const po = db.prepare('SELECT po_number, customer FROM purchase_orders WHERE id = ?').get(poId) as { po_number: string; customer: string } | undefined;
    if (!po) {
        return { success: false, error: 'PO not found' };
    }

    let finalRemarks = `PO: ${po.po_number}`;
    if (remarks) {
        finalRemarks += ` - ${remarks}`;
    }

    // Update stock: Mark as Dispatched and remove from Cold Store list
    const updateStock = db.prepare(`
        UPDATE fg_stock_master 
        SET status = 'Dispatched', cold_store = 'Dispatch', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    const insertMovement = db.prepare(`
        INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status, remarks, po_id, dispatch_purpose)
        VALUES (?, ?, 'DISPATCH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SALE')
    `);

    const updateMovementStatus = db.prepare(`
        UPDATE stock_movement_log 
        SET status = ?, mc_numbers = ?, approved_by_id = ?
        WHERE movement_id = ?
    `);

    // Optional: Update PO status if it's a sale
    const updatePOStatus = db.prepare("UPDATE purchase_orders SET status = 'Dispatched' WHERE id = ?");

    const transaction = db.transaction(() => {
        let availableMCs: any[] = [];

        // Determine required status based on PO branding type
        const poFull = db.prepare('SELECT branding_type FROM purchase_orders WHERE id = ?').get(poId) as { branding_type: string } | undefined;
        const brandingType = poFull?.branding_type || 'Demo';
        const requiredStatus = brandingType === 'Branded' ? 'Allocated' : 'Reserved';

        // Fetch cartons reserved/allocated for this PO in this store
        const stocks = db.prepare(`
            SELECT id, mc_number, grade, variety, type, packing_code, packing_date, status, cold_store, short_code, barcode
            FROM fg_stock_master
            WHERE cold_store = ? AND reserved_for_po = ? AND status = ?
        `).all(fromStore, po.po_number, requiredStatus) as CartonRow[];

        if (stocks.length === 0) {
            const hint = brandingType === 'Branded'
                ? `No repacked (Allocated) cartons found for this Branded PO in ${fromStore}. Please complete Repack In first.`
                : `No cartons found for this Demo PO in ${fromStore}.`;
            throw new Error(hint);
        }

        if (specificMCNumbers && specificMCNumbers.length > 0) {
            if (specificMCNumbers.length !== qty) {
                throw new Error(`Scan/Check count (${specificMCNumbers.length}) does not match requested quantity (${qty})`);
            }

            // Match against mc_number, short_code, OR customer barcode (multi-identifier)
            const matchedStocks = stocks.filter(c =>
                specificMCNumbers.includes(c.mc_number) ||
                (c.short_code && specificMCNumbers.includes(c.short_code)) ||
                (c.barcode && specificMCNumbers.includes(c.barcode))
            );
            if (matchedStocks.length !== specificMCNumbers.length) {
                throw new Error('Some scanned MCs are not found or not in the correct status for this PO in the selected store');
            }
            availableMCs = matchedStocks;
        } else {
            // FIFO fallback
            stocks.sort((a, b) => new Date(a.packing_date).getTime() - new Date(b.packing_date).getTime());
            availableMCs = stocks.slice(0, qty);
            if (availableMCs.length < qty) {
                throw new Error(`Only ${availableMCs.length} MC(s) are ${requiredStatus} for this PO in ${fromStore}, but requested ${qty}`);
            }
        }

        const mcNumbers = availableMCs.map(mc => mc.mc_number);
        const mcIds = availableMCs.map(mc => mc.id);
        const movedCount = availableMCs.length;

        // Update each MC
        for (const id of mcIds) {
            updateStock.run(id);
        }

        // Mark PO as dispatched
        updatePOStatus.run(poId);

        const status = movedCount < qty ? 'Partial' : 'Completed';

        if (existingMovementId) {
            updateMovementStatus.run(status, mcNumbers.join(','), userId, movementId);
        } else {
            const sampleCarton = availableMCs[0] || {};
            insertMovement.run(
                movementId,
                new Date().toISOString(),
                fromStore,
                toStore,
                sampleCarton.type || 'Unknown',
                sampleCarton.variety || 'Unknown',
                sampleCarton.packing_code || 'Unknown',
                sampleCarton.grade || 'Unknown',
                mcNumbers.join(','),
                movedCount,
                userId,
                status,
                finalRemarks,
                poId
            );
        }

        return {
            success: true,
            moveId: movementId,
            movedCount
        };
    });

    try {
        const result = transaction();
        return result;
    } catch (error: any) {
        console.error('Dispatch transaction error:', error);
        return { success: false, error: error.message || 'Failed to process dispatch' };
    }
}

// Handle REPACKING OUT - Store to Production
export async function handleRepackOut(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    console.log('[StockLogic] Handling Repack Out:', JSON.stringify(data));
    const validation = repackStartSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, mcNumbers, remarks } = validation.data;
    const db = getDb();
    const movementId = existingMovementId || generateMovementId();

    const updateStock = db.prepare(`
        UPDATE fg_stock_master 
        SET status = 'In Repacking', cold_store = 'Production', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    const insertMovement = db.prepare(`
        INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, mc_numbers, qty_mcs, moved_by_id, status, remarks)
        VALUES (?, ?, 'REPACK_OUT', ?, 'Production', ?, ?, ?, 'Completed', ?)
    `);

    const transaction = db.transaction(() => {
        const placeholders = mcNumbers.map(() => '?').join(',');
        
        // Fetch candidate cartons directly
        const stocks = db.prepare(`
            SELECT id, mc_number, status, cold_store, reserved_for_po 
            FROM fg_stock_master
            WHERE mc_number IN (${placeholders}) AND cold_store = ?
        `).all(...mcNumbers, fromStore) as { id: number; mc_number: string; status: string; cold_store: string; reserved_for_po: string | null }[];

        if (stocks.length !== mcNumbers.length) {
            throw new Error('One or more MCs are not in the selected store or do not exist');
        }

        // Fetch pending transfer MCs to prevent double allocation
        const pendingRequests = db.prepare(`
            SELECT mc_numbers 
            FROM stock_movement_log 
            WHERE status = 'Pending Approval' AND from_location = ?
        `).all(fromStore) as { mc_numbers: string }[];
        
        const pendingMCs = new Set<string>();
        for (const req of pendingRequests) {
            if (req.mc_numbers) {
                for (const mc of req.mc_numbers.split(',')) {
                    pendingMCs.add(mc);
                }
            }
        }

        for (const stock of stocks) {
            if (pendingMCs.has(stock.mc_number)) {
                throw new Error(`MC ${stock.mc_number} is already part of a pending transfer request`);
            }

            if (stock.status === 'Available') {
                continue;
            } else if (stock.status === 'Reserved') {
                if (!stock.reserved_for_po) {
                    throw new Error(`MC ${stock.mc_number} is Reserved but not linked to any PO`);
                }
                const linkedPO = db.prepare("SELECT branding_type FROM purchase_orders WHERE po_number = ?").get(stock.reserved_for_po) as { branding_type: string } | undefined;
                if (linkedPO && linkedPO.branding_type === 'Demo') {
                    throw new Error(`MC ${stock.mc_number} is reserved for Demo PO '${stock.reserved_for_po}'. Demo POs cannot be repacked.`);
                }
            } else {
                throw new Error(`MC ${stock.mc_number} has invalid status '${stock.status}' for repacking`);
            }
        }

        for (const stock of stocks) {
            updateStock.run(stock.id);
        }

        insertMovement.run(
            movementId,
            new Date().toISOString(),
            fromStore,
            mcNumbers.join(','),
            stocks.length,
            userId,
            remarks || 'Sent for repacking'
        );

        return {
            moveId: movementId,
            movedCount: stocks.length
        };
    });

    try {
        const result = transaction();
        return { success: true, ...result };
    } catch (error: any) {
        console.error('Repack Out transaction error:', error);
        return { success: false, error: error.message || 'Failed to process repacking exit' };
    }
}

// Handle REPACKING IN - Production to Store
export async function handleRepackIn(data: unknown, userId: number): Promise<MovementResult> {
    console.log('[StockLogic] Handling Repack In:', JSON.stringify(data));
    const validation = repackCompleteSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };
    }

    const { originalMcNumbers, toStore, newPacking, items, remarks } = validation.data;
    const db = getDb();
    const movementId = generateMovementId();
    const packingCode = packingToCode(newPacking);

    const insertStock = db.prepare(`
        INSERT INTO fg_stock_master (
            mc_number, grade, variety, type, packing_code, packing_date, 
            cold_store, status, reserved_for_po, reserved_line_item, 
            parent_mc_id, is_repacked, created_by_id, barcode, short_code, section_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);

    const markOriginalAsRepacked = db.prepare(`
        UPDATE fg_stock_master SET status = 'Repacked', updated_at = CURRENT_TIMESTAMP WHERE mc_number = ?
    `);

    const insertMovement = db.prepare(`
        INSERT INTO stock_movement_log (
            movement_id, movement_datetime, action_type, from_location, to_location, 
            type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status, remarks
        )
        VALUES (?, ?, 'REPACK_IN', 'Production', ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)
    `);

    const transaction = db.transaction(() => {
        // Fetch original MCs to inherit metadata (Variety, Grade, PO Allocation)
        const placeholders = originalMcNumbers.map(() => '?').join(',');
        const parents = db.prepare(`
            SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})
        `).all(...originalMcNumbers) as StockMasterRow[];

        if (parents.length !== originalMcNumbers.length) {
            throw new Error('One or more original MCs not found');
        }

        // Verify parents are actually 'In Repacking' and in 'Production'
        const invalidParents = parents.filter(p => p.status !== 'In Repacking' || p.cold_store !== 'Production');
        if (invalidParents.length > 0) {
            throw new Error('One or more original MCs are not in repacking status');
        }

        const template = parents[0];
        const newMcNumbers: string[] = [];
        const packingDate = formatDate(new Date());

        let currentSeq = getNextMCSequence(db, template.grade, packingCode);
        const generatedShortCodes = generateShortCodesBlock(db, items.length);
        const newShortCodes: string[] = [];

        const settingVal = db.prepare("SELECT value FROM settings WHERE key = 'enable_location_mapping'").get() as { value: string } | undefined;
        const useMapping = settingVal?.value === 'true';

        const allocations = useMapping ? allocateSectionsForBatch(db, toStore, items.length) : [];
        let allocationIdx = 0;
        let allocatedCount = 0;

        // Check if customer barcodes are enabled and available for this PO
        const barcodeSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'enable_customer_barcode'").get() as { value: string } | undefined;
        const customerBarcodesEnabled = barcodeSetting?.value === 'true';

        let customerBarcodePool: { id: number; barcode: string }[] = [];
        if (customerBarcodesEnabled && template.reserved_for_po) {
            // Fetch the PO to check branding type
            const linkedPO = db.prepare("SELECT id, branding_type FROM purchase_orders WHERE po_number = ?").get(template.reserved_for_po) as { id: number; branding_type: string } | undefined;
            if (linkedPO && linkedPO.branding_type === 'Branded') {
                customerBarcodePool = db.prepare(`
                    SELECT id, barcode FROM po_customer_barcodes
                    WHERE po_id = ? AND status = 'Unused'
                    ORDER BY id ASC
                `).all(linkedPO.id) as { id: number; barcode: string }[];
            }
        }

        const markBarcodeUsed = db.prepare(`
            UPDATE po_customer_barcodes SET status = 'Assigned', mc_number = ? WHERE id = ?
        `);

        // Create new MCs
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const status = template.reserved_for_po ? 'Allocated' : 'Available';

            let mcNumber = item.mcNumber;
            if (!mcNumber || mcNumber === 'GENERATE' || mcNumber.startsWith('GENERATE')) {
                mcNumber = generateMCNumber(template.grade, packingCode, currentSeq);
                currentSeq++;
            }

            const shortCode = generatedShortCodes[i];
            newShortCodes.push(shortCode);

            // Assign customer barcode if available, otherwise use item barcode or short code
            let barcode = item.barcode || shortCode;
            if (customerBarcodesEnabled && customerBarcodePool.length > 0) {
                const customerBarcode = customerBarcodePool.shift()!;
                barcode = customerBarcode.barcode;
                markBarcodeUsed.run(mcNumber, customerBarcode.id);
            }

            let currentSectionId = null;
            if (useMapping && allocations.length > 0) {
                if (allocatedCount >= allocations[allocationIdx].count) {
                    allocationIdx++;
                    allocatedCount = 0;
                }
                currentSectionId = allocations[allocationIdx].sectionId;
                allocatedCount++;
            }

            insertStock.run(
                mcNumber,
                template.grade,
                template.variety,
                template.type,
                packingCode,
                packingDate,
                toStore,
                status,
                template.reserved_for_po,
                template.reserved_line_item,
                template.id,
                userId,
                barcode,
                shortCode,
                currentSectionId
            );
            newMcNumbers.push(mcNumber);
        }

        // Deactivate original MCs
        for (const mcNumber of originalMcNumbers) {
            markOriginalAsRepacked.run(mcNumber);
        }

        // Log movement
        insertMovement.run(
            movementId,
            new Date().toISOString(),
            toStore,
            template.type,
            template.variety,
            newPacking,
            template.grade,
            newMcNumbers.join(','),
            items.length,
            userId,
            remarks || `Repacked from ${originalMcNumbers.length} MCs`
        );

        return {
            moveId: movementId,
            movedCount: items.length,
            shortCodes: newShortCodes
        };
    });

    try {
        const result = transaction();
        return { success: true, ...result };
    } catch (error: any) {
        console.error('Repack In transaction error:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: false, error: 'One or more new MC numbers or barcodes already exist.' };
        }
        return { success: false, error: error.message || 'Failed to process repacking return' };
    }
}

// -------------------------------------------------------------
// Short Code Sequence Generator (Base32, 3-char with 4-char fallback)
// -------------------------------------------------------------
const BASE32_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function encodeBase32(num: number, len: number): string {
    let result = '';
    let temp = num;
    const base = BASE32_ALPHABET.length;
    while (temp > 0) {
        result = BASE32_ALPHABET[temp % base] + result;
        temp = Math.floor(temp / base);
    }
    return result.padStart(len, BASE32_ALPHABET[0]);
}

export function generateShortCodesBlock(db: any, qty: number): string[] {
    // Fetch all currently active short codes in the system
    const activeRows = db.prepare(`
        SELECT short_code FROM fg_stock_master 
        WHERE short_code IS NOT NULL 
        AND status NOT IN ('Repacked', 'Dispatched')
    `).all() as { short_code: string }[];
    
    const activeCodes = new Set(activeRows.map(row => row.short_code));

    // 1. Try 3-character space (32^3 = 32,768 combinations)
    const max3 = 32768;
    const pointerSetting3 = db.prepare("SELECT value FROM system_settings WHERE key = 'carton_short_code_pointer'").get() as { value: string } | undefined;
    let pointer3 = pointerSetting3 ? parseInt(pointerSetting3.value, 10) : 0;
    if (isNaN(pointer3)) pointer3 = 0;

    let foundStart3 = -1;
    for (let attempt = 0; attempt < max3; attempt++) {
        const candidateStart = (pointer3 + attempt) % max3;
        let blockIsFree = true;

        for (let i = 0; i < qty; i++) {
            const seqNum = (candidateStart + i) % max3;
            const code = encodeBase32(seqNum, 3);
            if (activeCodes.has(code)) {
                blockIsFree = false;
                break;
            }
        }

        if (blockIsFree) {
            foundStart3 = candidateStart;
            break;
        }
    }

    if (foundStart3 !== -1) {
        const nextPointer3 = (foundStart3 + qty) % max3;
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('carton_short_code_pointer', ?)").run(nextPointer3.toString());
        return Array.from({ length: qty }).map((_, i) => encodeBase32((foundStart3 + i) % max3, 3));
    }

    // 2. Fallback to 4-character space (32^4 = 1,048,576 combinations)
    const max4 = 1048576;
    const pointerSetting4 = db.prepare("SELECT value FROM system_settings WHERE key = 'carton_short_code_pointer_4'").get() as { value: string } | undefined;
    let pointer4 = pointerSetting4 ? parseInt(pointerSetting4.value, 10) : 0;
    if (isNaN(pointer4)) pointer4 = 0;

    let foundStart4 = -1;
    for (let attempt = 0; attempt < max4; attempt++) {
        const candidateStart = (pointer4 + attempt) % max4;
        let blockIsFree = true;

        for (let i = 0; i < qty; i++) {
            const seqNum = (candidateStart + i) % max4;
            const code = encodeBase32(seqNum, 4);
            if (activeCodes.has(code)) {
                blockIsFree = false;
                break;
            }
        }

        if (blockIsFree) {
            foundStart4 = candidateStart;
            break;
        }
    }

    if (foundStart4 !== -1) {
        const nextPointer4 = (foundStart4 + qty) % max4;
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('carton_short_code_pointer_4', ?)").run(nextPointer4.toString());
        return Array.from({ length: qty }).map((_, i) => encodeBase32((foundStart4 + i) % max4, 4));
    }

    // Fallback: random codes
    return Array.from({ length: qty }).map(() => 'F' + Math.random().toString(36).substring(2, 5).toUpperCase());
}

// -------------------------------------------------------------
// Helper to retrieve stock master records excluding pending allocations
// -------------------------------------------------------------
export interface Carton {
    id: number;
    mc_number: string;
    grade: string;
    variety: string;
    type: string;
    packing_code: string;
    packing_date: string;
    cold_store: string;
    status: string;
    barcode?: string;
    short_code?: string;
}

export function getAvailableCartons(
    db: any,
    store: string,
    skuFilters?: { type?: string; variety?: string; packing?: string; grade?: string },
    excludeMovementId?: string
): Carton[] {
    let cartonQuery = `
        SELECT id, mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, barcode, short_code
        FROM fg_stock_master
        WHERE cold_store = ? AND status = 'Available'
    `;
    const params: any[] = [store];

    if (skuFilters) {
        if (skuFilters.type) {
            cartonQuery += ' AND type = ?';
            params.push(skuFilters.type);
        }
        if (skuFilters.variety) {
            cartonQuery += ' AND variety = ?';
            params.push(skuFilters.variety);
        }
        if (skuFilters.packing) {
            const packingCode = packingToCode(skuFilters.packing);
            cartonQuery += ' AND packing_code = ?';
            params.push(packingCode);
        }
        if (skuFilters.grade) {
            cartonQuery += ' AND grade = ?';
            params.push(skuFilters.grade);
        }
    }
    cartonQuery += ' ORDER BY packing_date ASC';

    const cartons = db.prepare(cartonQuery).all(...params) as Carton[];

    // Fetch all Pending Approval movement requests from this store
    let pendingQuery = `
        SELECT movement_id, mc_numbers, qty_mcs, type, variety, packing, grade, allocation_strategy
        FROM stock_movement_log
        WHERE status = 'Pending Approval' AND from_location = ?
    `;
    const pendingParams: (string | undefined)[] = [store];
    if (excludeMovementId) {
        pendingQuery += ' AND movement_id != ?';
        pendingParams.push(excludeMovementId);
    }
    const pendingRequests = db.prepare(pendingQuery).all(...pendingParams) as PendingMovementRow[];

    const reservedMCs = new Set<string>();

    // Step A: Exclude explicitly listed mc_numbers
    for (const req of pendingRequests) {
        if (req.mc_numbers) {
            const list = req.mc_numbers.split(',');
            for (const mc of list) {
                reservedMCs.add(mc);
            }
        }
    }

    // Step B: Exclude spec-based allocations in FIFO/LIFO order
    for (const req of pendingRequests) {
        if (!req.mc_numbers) {
            const { type: rType, variety: rVariety, packing: rPacking, grade: rGrade, qty_mcs, allocation_strategy } = req;
            const rPackingCode = rPacking ? packingToCode(rPacking) : '';

            // Filter available cartons that match the pending request specs and are not already reserved
            const matches = cartons.filter(c => {
                if (reservedMCs.has(c.mc_number)) return false;
                if (rType && c.type !== rType) return false;
                if (rVariety && c.variety !== rVariety) return false;
                if (rPackingCode && c.packing_code !== rPackingCode) return false;
                if (rGrade && c.grade !== rGrade) return false;
                return true;
            });

            // Sort matches based on strategy
            if (allocation_strategy === 'LIFO') {
                matches.sort((a, b) => new Date(b.packing_date).getTime() - new Date(a.packing_date).getTime());
            } else {
                matches.sort((a, b) => new Date(a.packing_date).getTime() - new Date(b.packing_date).getTime());
            }

            // Reserve the first qty_mcs cartons
            const reserveCount = Math.min(qty_mcs, matches.length);
            for (let i = 0; i < reserveCount; i++) {
                reservedMCs.add(matches[i].mc_number);
            }
        }
    }

    return cartons.filter(c => !reservedMCs.has(c.mc_number));
}

// -------------------------------------------------------------
// Helper to distribute incoming cartons to sections using Best-Fit logic
// -------------------------------------------------------------
interface SectionOccupancy {
    id: number;
    name: string;
    capacity_mcs: number;
    occupied: number;
    remaining: number;
}

export function allocateSectionsForBatch(
    db: any,
    storeName: string,
    qty: number
): { sectionId: number; count: number }[] {
    // 1. Get all sections for the store
    let sections = db.prepare(`
        SELECT id, name, capacity_mcs FROM store_sections WHERE store_name = ?
    `).all(storeName) as { id: number; name: string; capacity_mcs: number }[];

    if (sections.length === 0) {
        db.prepare(`
            INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs)
            VALUES (?, 'Section A', 500), (?, 'Section B', 500), (?, 'Section C', 500), (?, 'Section D', 500)
        `).run(storeName, storeName, storeName, storeName);
        
        sections = db.prepare(`
            SELECT id, name, capacity_mcs FROM store_sections WHERE store_name = ?
        `).all(storeName) as { id: number; name: string; capacity_mcs: number }[];
    }

    // 2. Query occupied counts for each section
    const occupiedRows = db.prepare(`
        SELECT section_id, COUNT(*) as count 
        FROM fg_stock_master 
        WHERE cold_store = ? AND status NOT IN ('Repacked', 'Dispatched') AND section_id IS NOT NULL
        GROUP BY section_id
    `).all(storeName) as { section_id: number; count: number }[];

    const occupancyMap = new Map<number, number>();
    for (const row of occupiedRows) {
        occupancyMap.set(row.section_id, row.count);
    }

    // Combine sections with occupancy details
    const list: SectionOccupancy[] = sections.map(s => {
        const occupied = occupancyMap.get(s.id) || 0;
        return {
            id: s.id,
            name: s.name,
            capacity_mcs: s.capacity_mcs,
            occupied,
            remaining: Math.max(0, s.capacity_mcs - occupied)
        };
    });

    // Sort sections alphabetically by default to ensure deterministic behavior when capacities tie
    list.sort((a, b) => a.name.localeCompare(b.name));

    // 3. Search for a section that fits the ENTIRE batch (Best-Fit)
    const fitList = list.filter(s => s.remaining >= qty);
    if (fitList.length > 0) {
        fitList.sort((a, b) => a.remaining - b.remaining);
        const bestSection = fitList[0];
        console.log(`[Best-Fit Allocation] Batch of ${qty} fits entirely in section '${bestSection.name}' (Space: ${bestSection.remaining}/${bestSection.capacity_mcs})`);
        return [{ sectionId: bestSection.id, count: qty }];
    }

    // 4. Split-Fit Path: If no single section fits, fill sections from largest available space down
    console.log(`[Best-Fit Allocation] Batch of ${qty} is too large for any single section. Splitting...`);
    list.sort((a, b) => b.remaining - a.remaining);

    const allocations: { sectionId: number; count: number }[] = [];
    let remainingQty = qty;

    for (const section of list) {
        if (remainingQty <= 0) break;
        if (section.remaining > 0) {
            const allocateAmount = Math.min(remainingQty, section.remaining);
            allocations.push({ sectionId: section.id, count: allocateAmount });
            remainingQty -= allocateAmount;
            console.log(`[Best-Fit Allocation] Routed ${allocateAmount} MCs to section '${section.name}'`);
        }
    }

    // 5. Overflow Fallback: If still some cartons left, route them to the section that had the most starting space
    if (remainingQty > 0) {
        const primarySection = list[0] || sections[0];
        const existing = allocations.find(a => a.sectionId === primarySection.id);
        if (existing) {
            existing.count += remainingQty;
        } else {
            allocations.push({ sectionId: primarySection.id, count: remainingQty });
        }
        console.warn(`[Best-Fit Allocation] Store '${storeName}' is OVER CAPACITY! Placed ${remainingQty} overflow MCs in section '${primarySection.name || 'Unknown'}'`);
    }

    return allocations;
}
