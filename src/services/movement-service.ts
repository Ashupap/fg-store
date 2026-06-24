import type Database from 'better-sqlite3';
import { inwardMovementSchema, transferMovementSchema, dispatchMovementSchema, repackStartSchema, repackCompleteSchema } from '@/lib/validations';
import { generateMovementId, generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import type { MovementResult } from '@/types';
import type { CartonRow, StockMasterRow, PendingMovementRow } from '@/lib/db-types';
import { StockService } from './stock-service';
import { AllocationService } from './allocation-service';

export class MovementService {
  private stockService: StockService;
  private allocationService: AllocationService;

  constructor(private db: Database.Database) {
    this.stockService = new StockService(db);
    this.allocationService = new AllocationService(db);
  }

  async handleInward(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    return this.stockService.handleInward(data, userId, existingMovementId);
  }

  async handleTransfer(data: unknown, userId: number, existingMovementId?: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    const validation = transferMovementSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, type, variety, packing, grade, qty, allocationStrategy } = validation.data;
    const movementId = existingMovementId || generateMovementId();

    const updateStock = this.db.prepare(`
      UPDATE fg_stock_master SET cold_store = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    const insertMovement = this.db.prepare(`
      INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status)
      VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateMovementStatus = this.db.prepare(`
      UPDATE stock_movement_log SET status = ?, mc_numbers = ?, approved_by_id = ? WHERE movement_id = ?
    `);

    const transaction = this.db.transaction(() => {
      let availableMCs: { id: number; mc_number: string; packing_date: string }[] = [];

      const getAvailable = () => {
        const allAvailable = this.db.prepare(`
          SELECT id, mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, barcode, short_code
          FROM fg_stock_master
          WHERE cold_store = ? AND status = 'Available'
          AND type = ? AND variety = ? AND packing_code = ? AND grade = ?
          ORDER BY packing_date ASC
        `).all(fromStore, type, variety, packingToCode(packing), grade) as { id: number; mc_number: string; packing_date: string }[];

        const pendingRequests = this.db.prepare(`
          SELECT mc_numbers FROM stock_movement_log 
          WHERE status = 'Pending Approval' AND from_location = ?
        `).all(existingMovementId ? undefined : fromStore) as { mc_numbers: string | null }[];

        const reservedMCs = new Set<string>();
        for (const req of pendingRequests) {
          if (req.mc_numbers) {
            for (const mc of req.mc_numbers.split(',')) { reservedMCs.add(mc); }
          }
        }
        return allAvailable.filter(c => !reservedMCs.has(c.mc_number));
      };

      if (specificMCNumbers && specificMCNumbers.length > 0) {
        if (specificMCNumbers.length !== qty) {
          throw new Error(`Scan count (${specificMCNumbers.length}) does not match requested quantity (${qty})`);
        }
        const filteredCartons = getAvailable();
        const stocks = filteredCartons.filter(c => specificMCNumbers.includes(c.mc_number));
        if (stocks.length !== specificMCNumbers.length) {
          throw new Error('Some scanned MCs are invalid, already reserved for pending requests, or not available in the selected store');
        }
        availableMCs = stocks;
      } else {
        const filteredCartons = getAvailable();
        if (allocationStrategy === 'LIFO') {
          filteredCartons.sort((a, b) => new Date(b.packing_date).getTime() - new Date(a.packing_date).getTime());
        } else {
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

      for (const id of mcIds) { updateStock.run('In Transit', id); }

      const status = movedCount < qty ? 'Partial' : 'In Transit';
      if (existingMovementId) {
        updateMovementStatus.run(status, mcNumbers.join(','), userId, movementId);
      } else {
        insertMovement.run(movementId, new Date().toISOString(), fromStore, toStore, type, variety, packing, grade, mcNumbers.join(','), movedCount, userId, status);
      }

      return { moveId: movementId, movedCount };
    });

    try {
      const result = transaction();
      return { success: true, ...result };
    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: err.message || 'Failed to process transfer movement' };
    }
  }

  async handleDispatch(data: unknown, userId: number, existingMovementId?: string, specificMCNumbers?: string[]): Promise<MovementResult> {
    const validation = dispatchMovementSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };
    }

    const { fromStore, toStore, qty, poId, remarks } = validation.data;
    const movementId = existingMovementId || generateMovementId();

    if (!poId) return { success: false, error: 'PO is required for dispatches' };

    const po = this.db.prepare('SELECT po_number, customer FROM purchase_orders WHERE id = ?').get(poId) as { po_number: string; customer: string } | undefined;
    if (!po) return { success: false, error: 'PO not found' };

    let finalRemarks = `PO: ${po.po_number}`;
    if (remarks) finalRemarks += ` - ${remarks}`;

    const updateStock = this.db.prepare(`UPDATE fg_stock_master SET status = 'Dispatched', cold_store = 'Dispatch', updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    const insertMovement = this.db.prepare(`
      INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status, remarks, po_id, dispatch_purpose)
      VALUES (?, ?, 'DISPATCH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SALE')
    `);
    const updateMovementStatus = this.db.prepare(`UPDATE stock_movement_log SET status = ?, mc_numbers = ?, approved_by_id = ? WHERE movement_id = ?`);
    const updatePOStatus = this.db.prepare("UPDATE purchase_orders SET status = 'Dispatched' WHERE id = ?");

    const transaction = this.db.transaction(() => {
      let availableMCs: CartonRow[] = [];

      const poFull = this.db.prepare('SELECT branding_type FROM purchase_orders WHERE id = ?').get(poId) as { branding_type: string } | undefined;
      const brandingType = poFull?.branding_type || 'Demo';
      const requiredStatus = brandingType === 'Branded' ? 'Allocated' : 'Reserved';

      const stocks = this.db.prepare(`
        SELECT id, mc_number, grade, variety, type, packing_code, packing_date, status, cold_store, short_code, barcode
        FROM fg_stock_master
        WHERE cold_store = ? AND reserved_for_po = ? AND status = ?
      `).all(fromStore, po.po_number, requiredStatus) as CartonRow[];

      if (stocks.length === 0) {
        throw new Error(brandingType === 'Branded'
          ? `No repacked (Allocated) cartons found for this Branded PO in ${fromStore}. Please complete Repack In first.`
          : `No cartons found for this Demo PO in ${fromStore}.`);
      }

      if (specificMCNumbers && specificMCNumbers.length > 0) {
        if (specificMCNumbers.length !== qty) {
          throw new Error(`Scan/Check count (${specificMCNumbers.length}) does not match requested quantity (${qty})`);
        }
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
        stocks.sort((a, b) => new Date(a.packing_date).getTime() - new Date(b.packing_date).getTime());
        availableMCs = stocks.slice(0, qty);
        if (availableMCs.length < qty) {
          throw new Error(`Only ${availableMCs.length} MC(s) are ${requiredStatus} for this PO in ${fromStore}, but requested ${qty}`);
        }
      }

      const mcNumbers = availableMCs.map(mc => mc.mc_number);
      const mcIds = availableMCs.map(mc => mc.id);
      const movedCount = availableMCs.length;

      for (const id of mcIds) { updateStock.run(id); }
      updatePOStatus.run(poId);

      const status = movedCount < qty ? 'Partial' : 'Completed';
      if (existingMovementId) {
        updateMovementStatus.run(status, mcNumbers.join(','), userId, movementId);
      } else {
        const sampleCarton = availableMCs[0] || {};
        insertMovement.run(movementId, new Date().toISOString(), fromStore, toStore, sampleCarton.type || 'Unknown', sampleCarton.variety || 'Unknown', sampleCarton.packing_code || 'Unknown', sampleCarton.grade || 'Unknown', mcNumbers.join(','), movedCount, userId, status, finalRemarks, poId);
      }

      return { success: true, moveId: movementId, movedCount };
    });

    try { return transaction(); }
    catch (error: unknown) { const err = error as { message?: string }; return { success: false, error: err.message || 'Failed to process dispatch' }; }
  }

  async handleRepackOut(data: unknown, userId: number, existingMovementId?: string): Promise<MovementResult> {
    const validation = repackStartSchema.safeParse(data);
    if (!validation.success) return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };

    const { fromStore, mcNumbers, remarks } = validation.data;
    const movementId = existingMovementId || generateMovementId();

    const updateStock = this.db.prepare(`UPDATE fg_stock_master SET status = 'In Repacking', cold_store = 'Production', updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    const insertMovement = this.db.prepare(`
      INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, mc_numbers, qty_mcs, moved_by_id, status, remarks)
      VALUES (?, ?, 'REPACK_OUT', ?, 'Production', ?, ?, ?, 'Completed', ?)
    `);

    const transaction = this.db.transaction(() => {
      const placeholders = mcNumbers.map(() => '?').join(',');
      const stocks = this.db.prepare(`SELECT id, mc_number, status, cold_store, reserved_for_po FROM fg_stock_master WHERE mc_number IN (${placeholders}) AND cold_store = ?`).all(...mcNumbers, fromStore) as { id: number; mc_number: string; status: string; cold_store: string; reserved_for_po: string | null }[];

      if (stocks.length !== mcNumbers.length) throw new Error('One or more MCs are not in the selected store or do not exist');

      const pendingRequests = this.db.prepare(`SELECT mc_numbers FROM stock_movement_log WHERE status = 'Pending Approval' AND from_location = ?`).all(fromStore) as { mc_numbers: string }[];
      const pendingMCs = new Set<string>();
      for (const req of pendingRequests) {
        if (req.mc_numbers) { for (const mc of req.mc_numbers.split(',')) { pendingMCs.add(mc); } }
      }

      for (const stock of stocks) {
        if (pendingMCs.has(stock.mc_number)) throw new Error(`MC ${stock.mc_number} is already part of a pending transfer request`);
        if (stock.status === 'Available') continue;
        else if (stock.status === 'Reserved') {
          if (!stock.reserved_for_po) throw new Error(`MC ${stock.mc_number} is Reserved but not linked to any PO`);
          const linkedPO = this.db.prepare("SELECT branding_type FROM purchase_orders WHERE po_number = ?").get(stock.reserved_for_po) as { branding_type: string } | undefined;
          if (linkedPO && linkedPO.branding_type === 'Demo') throw new Error(`MC ${stock.mc_number} is reserved for Demo PO '${stock.reserved_for_po}'. Demo POs cannot be repacked.`);
        } else {
          throw new Error(`MC ${stock.mc_number} has invalid status '${stock.status}' for repacking`);
        }
      }

      for (const stock of stocks) { updateStock.run(stock.id); }
      insertMovement.run(movementId, new Date().toISOString(), fromStore, mcNumbers.join(','), stocks.length, userId, remarks || 'Sent for repacking');
      return { moveId: movementId, movedCount: stocks.length };
    });

    try { const result = transaction(); return { success: true, ...result }; }
    catch (error: unknown) { const err = error as { message?: string }; return { success: false, error: err.message || 'Failed to process repacking exit' }; }
  }

  async handleRepackIn(data: unknown, userId: number): Promise<MovementResult> {
    const validation = repackCompleteSchema.safeParse(data);
    if (!validation.success) return { success: false, error: validation.error.issues?.[0]?.message || 'Validation failed' };

    const { originalMcNumbers, toStore, newPacking, items, remarks } = validation.data;
    const movementId = generateMovementId();
    const packingCode = packingToCode(newPacking);

    const insertStock = this.db.prepare(`
      INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, reserved_for_po, reserved_line_item, parent_mc_id, is_repacked, created_by_id, barcode, short_code, section_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `);
    const markOriginalAsRepacked = this.db.prepare(`UPDATE fg_stock_master SET status = 'Repacked', updated_at = CURRENT_TIMESTAMP WHERE mc_number = ?`);
    const insertMovement = this.db.prepare(`
      INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, from_location, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, status, remarks)
      VALUES (?, ?, 'REPACK_IN', 'Production', ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?)
    `);

    const transaction = this.db.transaction(() => {
      const placeholders = originalMcNumbers.map(() => '?').join(',');
      const parents = this.db.prepare(`SELECT * FROM fg_stock_master WHERE mc_number IN (${placeholders})`).all(...originalMcNumbers) as StockMasterRow[];
      if (parents.length !== originalMcNumbers.length) throw new Error('One or more original MCs not found');

      const invalidParents = parents.filter(p => p.status !== 'In Repacking' || p.cold_store !== 'Production');
      if (invalidParents.length > 0) throw new Error('One or more original MCs are not in repacking status');

      const template = parents[0];
      const newMcNumbers: string[] = [];
      const packingDate = formatDate(new Date());

      let currentSeq = getNextMCSequence(this.db, template.grade, packingCode);
      const generatedShortCodes = this.stockService['generateShortCodesBlock'](items.length);
      const newShortCodes: string[] = [];

      const settingVal = this.db.prepare("SELECT value FROM settings WHERE key = 'enable_location_mapping'").get() as { value: string } | undefined;
      const useMapping = settingVal?.value === 'true';
      const allocations = useMapping ? this.stockService.allocateSectionsForBatch(toStore, items.length) : [];
      let allocationIdx = 0;
      let allocatedCount = 0;

      const barcodeSetting = this.db.prepare("SELECT value FROM system_settings WHERE key = 'enable_customer_barcode'").get() as { value: string } | undefined;
      const customerBarcodesEnabled = barcodeSetting?.value === 'true';
      let customerBarcodePool: { id: number; barcode: string }[] = [];
      if (customerBarcodesEnabled && template.reserved_for_po) {
        const linkedPO = this.db.prepare("SELECT id, branding_type FROM purchase_orders WHERE po_number = ?").get(template.reserved_for_po) as { id: number; branding_type: string } | undefined;
        if (linkedPO && linkedPO.branding_type === 'Branded') {
          customerBarcodePool = this.db.prepare(`SELECT id, barcode FROM po_customer_barcodes WHERE po_id = ? AND status = 'Unused' ORDER BY id ASC`).all(linkedPO.id) as { id: number; barcode: string }[];
        }
      }
      const markBarcodeUsed = this.db.prepare(`UPDATE po_customer_barcodes SET status = 'Assigned', mc_number = ? WHERE id = ?`);

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

        let barcode = item.barcode || shortCode;
        if (customerBarcodesEnabled && customerBarcodePool.length > 0) {
          const customerBarcode = customerBarcodePool.shift()!;
          barcode = customerBarcode.barcode;
          markBarcodeUsed.run(mcNumber, customerBarcode.id);
        }

        let currentSectionId = null;
        if (useMapping && allocations.length > 0) {
          if (allocatedCount >= allocations[allocationIdx].count) { allocationIdx++; allocatedCount = 0; }
          currentSectionId = allocations[allocationIdx].sectionId;
          allocatedCount++;
        }

        insertStock.run(mcNumber, template.grade, template.variety, template.type, packingCode, packingDate, toStore, status, template.reserved_for_po, template.reserved_line_item, template.id, userId, barcode, shortCode, currentSectionId);
        newMcNumbers.push(mcNumber);
      }

      for (const mcNumber of originalMcNumbers) { markOriginalAsRepacked.run(mcNumber); }
      insertMovement.run(movementId, new Date().toISOString(), toStore, template.type, template.variety, newPacking, template.grade, newMcNumbers.join(','), items.length, userId, remarks || `Repacked from ${originalMcNumbers.length} MCs`);
      return { moveId: movementId, movedCount: items.length, shortCodes: newShortCodes };
    });

    try { const result = transaction(); return { success: true, ...result }; }
    catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return { success: false, error: 'One or more new MC numbers or barcodes already exist.' };
      return { success: false, error: err.message || 'Failed to process repacking return' };
    }
  }
}
