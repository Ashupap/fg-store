import type Database from 'better-sqlite3';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema, repackStartSchema, repackCompleteSchema } from '@/lib/validations';
import { generateMovementId, generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import { processGlobalPendingAllocations } from '@/lib/allocation';
import type { MovementResult } from '@/types';
import type { CartonRow, StockMasterRow, PendingMovementRow } from '@/lib/db-types';
import { withTransaction } from '@/lib/transaction';

export class StockService {
  constructor(private db: Database.Database) {}

  private generateShortCodesBlock(qty: number): string[] {
    const activeRows = this.db.prepare(`
        SELECT short_code FROM fg_stock_master 
        WHERE short_code IS NOT NULL 
        AND status NOT IN ('Repacked', 'Dispatched')
    `).all() as { short_code: string }[];
    
    const activeCodes = new Set(activeRows.map(row => row.short_code));

    const max3 = 32768;
    const pointerSetting3 = this.db.prepare("SELECT value FROM system_settings WHERE key = 'carton_short_code_pointer'").get() as { value: string } | undefined;
    let pointer3 = pointerSetting3 ? parseInt(pointerSetting3.value, 10) : 0;
    if (isNaN(pointer3)) pointer3 = 0;

    let foundStart3 = -1;
    for (let attempt = 0; attempt < max3; attempt++) {
        const candidateStart = (pointer3 + attempt) % max3;
        let blockIsFree = true;
        for (let i = 0; i < qty; i++) {
            const seqNum = (candidateStart + i) % max3;
            const code = this.encodeBase32(seqNum, 3);
            if (activeCodes.has(code)) { blockIsFree = false; break; }
        }
        if (blockIsFree) { foundStart3 = candidateStart; break; }
    }
    if (foundStart3 !== -1) {
        const nextPointer3 = (foundStart3 + qty) % max3;
        this.db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('carton_short_code_pointer', ?)").run(nextPointer3.toString());
        return Array.from({ length: qty }).map((_, i) => this.encodeBase32((foundStart3 + i) % max3, 3));
    }

    const max4 = 1048576;
    const pointerSetting4 = this.db.prepare("SELECT value FROM system_settings WHERE key = 'carton_short_code_pointer_4'").get() as { value: string } | undefined;
    let pointer4 = pointerSetting4 ? parseInt(pointerSetting4.value, 10) : 0;
    if (isNaN(pointer4)) pointer4 = 0;

    let foundStart4 = -1;
    for (let attempt = 0; attempt < max4; attempt++) {
        const candidateStart = (pointer4 + attempt) % max4;
        let blockIsFree = true;
        for (let i = 0; i < qty; i++) {
            const seqNum = (candidateStart + i) % max4;
            const code = this.encodeBase32(seqNum, 4);
            if (activeCodes.has(code)) { blockIsFree = false; break; }
        }
        if (blockIsFree) { foundStart4 = candidateStart; break; }
    }
    if (foundStart4 !== -1) {
        const nextPointer4 = (foundStart4 + qty) % max4;
        this.db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('carton_short_code_pointer_4', ?)").run(nextPointer4.toString());
        return Array.from({ length: qty }).map((_, i) => this.encodeBase32((foundStart4 + i) % max4, 4));
    }

    return Array.from({ length: qty }).map(() => 'F' + Math.random().toString(36).substring(2, 5).toUpperCase());
  }

  private encodeBase32(num: number, length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    let n = num;
    for (let i = 0; i < length; i++) {
        result = chars[n % 32] + result;
        n = Math.floor(n / 32);
    }
    return result;
  }

  async handleInward(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    const validation = inwardMovementSchema.safeParse(data);
    if (!validation.success) {
        const error = validation.error;
        return { success: false, error: error.issues?.[0]?.message || 'Validation failed' };
    }

    const { toStore, type, variety, packing, grade, qty, remarks, barcodes, packingDate: customPackingDate } = validation.data;
    const movementId = existingMovementId || generateMovementId();
    const packingCode = packingToCode(packing);
    const packingDate = customPackingDate || formatDate(new Date());

    if (barcodes && barcodes.length !== qty) {
        return { success: false, error: `Barcode count (${barcodes.length}) does not match quantity (${qty})` };
    }

    const mcNumbers: string[] = [];
    const shortCodes: string[] = [];

    const insertStock = this.db.prepare(`
        INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id, barcode, short_code, section_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?, ?)
    `);

    const insertMovement = this.db.prepare(`
        INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, remarks, status)
        VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
    `);

    const updateMovementStatus = this.db.prepare(`
        UPDATE stock_movement_log 
        SET status = 'Completed', mc_numbers = ?, approved_by_id = ?
        WHERE movement_id = ?
    `);

    const transaction = this.db.transaction(() => {
        let currentSeq = getNextMCSequence(this.db, grade, packingCode);
        const generatedShortCodes = this.generateShortCodesBlock(qty);

        const settingVal = this.db.prepare("SELECT value FROM settings WHERE key = 'enable_location_mapping'").get() as { value: string } | undefined;
        const useMapping = settingVal?.value === 'true';
        const allocations = useMapping ? this.allocateSectionsForBatch(toStore, qty) : [];
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
                if (allocatedCount >= allocations[allocationIdx].count) { allocationIdx++; allocatedCount = 0; }
                currentSectionId = allocations[allocationIdx].sectionId;
                allocatedCount++;
            }

            insertStock.run(mcNumber, grade, variety, type, packingCode, packingDate, toStore, userId, barcode, shortCode, currentSectionId);
            currentSeq++;
        }

        if (existingMovementId) {
            updateMovementStatus.run(mcNumbers.join(','), userId, movementId);
        } else {
            insertMovement.run(movementId, new Date().toISOString(), toStore, type, variety, packing, grade, mcNumbers.join(','), qty, userId, remarks || null);
        }
    });

    try {
        transaction();
        try { processGlobalPendingAllocations(); } catch { /* Don't fail inward */ }
        return { success: true, moveId: movementId, movedCount: qty, shortCodes };
    } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message?.includes('barcode')) {
            return { success: false, error: 'One or more scanned barcodes already exist in the system.' };
        }
        return { success: false, error: 'Failed to process inward movement' };
    }
  }

  allocateSectionsForBatch(storeName: string, qty: number): { sectionId: number; count: number }[] {
    let sections = this.db.prepare(`
        SELECT id, name, capacity_mcs FROM store_sections WHERE store_name = ?
    `).all(storeName) as { id: number; name: string; capacity_mcs: number }[];

    if (sections.length === 0) {
        this.db.prepare(`
            INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs)
            VALUES (?, 'Section A', 500), (?, 'Section B', 500), (?, 'Section C', 500), (?, 'Section D', 500)
        `).run(storeName, storeName, storeName, storeName);
        sections = this.db.prepare(`
            SELECT id, name, capacity_mcs FROM store_sections WHERE store_name = ?
        `).all(storeName) as { id: number; name: string; capacity_mcs: number }[];
    }

    const occupiedRows = this.db.prepare(`
        SELECT section_id, COUNT(*) as count 
        FROM fg_stock_master 
        WHERE cold_store = ? AND status NOT IN ('Repacked', 'Dispatched') AND section_id IS NOT NULL
        GROUP BY section_id
    `).all(storeName) as { section_id: number; count: number }[];

    const occupancyMap = new Map<number, number>();
    for (const row of occupiedRows) { occupancyMap.set(row.section_id, row.count); }

    const list = sections.map(s => ({
        id: s.id, name: s.name, capacity_mcs: s.capacity_mcs,
        occupied: occupancyMap.get(s.id) || 0,
        remaining: Math.max(0, s.capacity_mcs - (occupancyMap.get(s.id) || 0))
    }));

    list.sort((a, b) => a.name.localeCompare(b.name));

    const fitList = list.filter(s => s.remaining >= qty);
    if (fitList.length > 0) {
        fitList.sort((a, b) => a.remaining - b.remaining);
        return [{ sectionId: fitList[0].id, count: qty }];
    }

    list.sort((a, b) => b.remaining - a.remaining);
    const allocations: { sectionId: number; count: number }[] = [];
    let remainingQty = qty;
    for (const section of list) {
        if (remainingQty <= 0) break;
        if (section.remaining > 0) {
            const allocateAmount = Math.min(remainingQty, section.remaining);
            allocations.push({ sectionId: section.id, count: allocateAmount });
            remainingQty -= allocateAmount;
        }
    }
    if (remainingQty > 0) {
        const primarySection = list[0] || sections[0];
        const existing = allocations.find(a => a.sectionId === primarySection.id);
        if (existing) { existing.count += remainingQty; }
        else { allocations.push({ sectionId: primarySection.id, count: remainingQty }); }
    }
    return allocations;
  }
}
