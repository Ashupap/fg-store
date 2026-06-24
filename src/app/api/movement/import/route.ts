import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { generateMovementId, generateMCNumber, getNextMCSequence, formatDate, packingToCode } from '@/lib/utils';
import { processGlobalPendingAllocations } from '@/lib/allocation';
import { generateShortCodesBlock } from '@/lib/stock-logic';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'inward:create')) {
            return NextResponse.json({ success: false, error: 'Unauthorized: Inward creation rights required' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Read spreadsheet
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets['inwards'] || workbook.Sheets[workbook.SheetNames[0]];

        if (!sheet) {
            return NextResponse.json({ success: false, error: 'Inwards sheet not found in workbook' }, { status: 400 });
        }

        const rows = XLSX.utils.sheet_to_json(sheet) as any[];
        const db = getDb();

        const results = {
            total: rows.length,
            success: 0,
            failed: 0,
            errors: [] as string[],
            details: [] as { row: number; status: string; info: string }[],
        };

        if (rows.length === 0) {
            return NextResponse.json({ success: false, error: 'Uploaded sheet is empty' }, { status: 400 });
        }

        // Setup DB Prepared Statements
        const insertStock = db.prepare(`
            INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id, barcode, short_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?)
        `);

        const insertMovement = db.prepare(`
            INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, type, variety, packing, grade, mc_numbers, qty_mcs, moved_by_id, remarks, status)
            VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
        `);

        // Check stores for assignment mapping (for localized operator security check)
        const allowedStores = user.assigned_store_names || [];
        const isRestricted = user.role !== 'admin' && user.role !== 'general_manager';

        // Run the entire import batch in a single database transaction
        // If any error occurs, it will roll back and we report it, or we handle rows transactional block safely.
        // To keep data integrity clean, we execute all successful rows in one transaction. If it fails, rollback.
        const transaction = db.transaction(() => {
            rows.forEach((row, index) => {
                const rowIdx = index + 2;

                const toStore = row.toStore || row.store || row.Store;
                const type = row.type || row.Type;
                const variety = row.variety || row.Variety;
                const packing = row.packing || row.Packing;
                const grade = row.grade || row.Grade;
                const qty = parseInt(row.qty || row.qty_mcs || row.quantity || 0, 10);
                const remarks = row.remarks || row.Remarks || 'Bulk Inward Import';
                const customPackingDate = row.packingDate || row.packing_date || null;
                const barcodesString = row.barcodes || row.barcode || '';

                // Row Validations
                if (!toStore || !type || !variety || !packing || !grade || qty <= 0) {
                    throw new Error(`Row ${rowIdx}: Missing required fields (toStore, type, variety, packing, grade, qty)`);
                }

                // Check store permissions
                if (isRestricted && !allowedStores.includes(toStore)) {
                    throw new Error(`Row ${rowIdx}: You are not assigned to receive stock at store '${toStore}'`);
                }

                // Verify store exists in DB
                const storeExists = db.prepare('SELECT id FROM stores WHERE name = ? AND is_active = 1').get(toStore);
                if (!storeExists) {
                    throw new Error(`Row ${rowIdx}: Store '${toStore}' is invalid or inactive`);
                }

                const packingCode = packingToCode(packing);
                const packingDate = customPackingDate ? String(customPackingDate).trim() : formatDate(new Date());

                // Barcodes check
                let barcodesList: string[] = [];
                if (barcodesString) {
                    barcodesList = String(barcodesString).split(',').map(b => b.trim());
                    if (barcodesList.length !== qty) {
                        throw new Error(`Row ${rowIdx}: Barcode count (${barcodesList.length}) does not match quantity (${qty})`);
                    }
                }

                // Generate MC sequence
                let currentSeq = getNextMCSequence(db, grade, packingCode);
                const generatedShortCodes = generateShortCodesBlock(db, qty);
                const mcNumbers: string[] = [];

                for (let i = 0; i < qty; i++) {
                    const mcNumber = generateMCNumber(grade, packingCode, currentSeq);
                    mcNumbers.push(mcNumber);
                    const shortCode = generatedShortCodes[i];
                    const barcode = barcodesList.length > 0 ? barcodesList[i] : shortCode;

                    try {
                        insertStock.run(mcNumber, grade, variety, type, packingCode, packingDate, toStore, user.id, barcode, shortCode);
                    } catch (err: any) {
                        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('barcode')) {
                            throw new Error(`Row ${rowIdx}: Barcode '${barcode}' already exists in system.`);
                        }
                        throw new Error(`Row ${rowIdx}: Database insert failed - ${err.message}`);
                    }
                    currentSeq++;
                }

                // Log movement
                const movementId = generateMovementId();
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
                    user.id,
                    remarks
                );

                results.success++;
                results.details.push({ row: rowIdx, status: 'Success', info: `Inwarded ${qty} MCs successfully` });
            });
        });

        try {
            transaction();

            // Run PO auto allocations
            try {
                processGlobalPendingAllocations();
            } catch (allocError) {
                console.error('Auto-allocation post-import failed:', allocError);
            }

            return NextResponse.json({ success: true, data: results });
        } catch (err: any) {
            console.error('Transactional import aborted:', err);
            return NextResponse.json({
                success: false,
                error: err.message || 'Import aborted due to transaction error'
            }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Import inwards HTTP error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to process import' }, { status: 500 });
    }
}
