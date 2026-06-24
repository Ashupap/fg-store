import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'master:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
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
        const db = getDb();

        const results = {
            stores: { success: 0, failed: 0, errors: [] as string[] },
            varieties: { success: 0, failed: 0, errors: [] as string[] },
            grades: { success: 0, failed: 0, errors: [] as string[] },
            packings: { success: 0, failed: 0, errors: [] as string[] },
            types: { success: 0, failed: 0, errors: [] as string[] }
        };

        const transaction = db.transaction(() => {
            // Process Stores Sheet
            const storeSheet = workbook.Sheets['stores'];
            if (storeSheet) {
                const rows = XLSX.utils.sheet_to_json(storeSheet) as any[];
                const upsertStore = db.prepare(`
                    INSERT INTO stores (name, type, location, capacity_tons, has_loading_facility, is_active)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(name) DO UPDATE SET
                        type = excluded.type,
                        location = COALESCE(excluded.location, location),
                        capacity_tons = excluded.capacity_tons,
                        has_loading_facility = excluded.has_loading_facility,
                        is_active = excluded.is_active,
                        updated_at = CURRENT_TIMESTAMP
                `);

                rows.forEach((row, idx) => {
                    const name = row.name || row.StoreName || row.Name;
                    if (!name || String(name).trim() === '') {
                        results.stores.failed++;
                        results.stores.errors.push(`Row ${idx + 2}: Store name is required.`);
                        return;
                    }

                    const type = row.type || row.Type || 'Cold Store';
                    const location = row.location || row.Location || null;
                    const capacity = parseFloat(row.capacity_tons || row.capacity || 0);
                    const hasLoading = row.has_loading_facility === 1 || row.has_loading_facility === '1' || row.has_loading_facility === true || row.has_loading_facility === 'true' ? 1 : 0;
                    const isActive = row.is_active === 0 || row.is_active === '0' || row.is_active === false || row.is_active === 'false' ? 0 : 1;

                    try {
                        upsertStore.run(String(name).trim(), String(type).trim(), location ? String(location).trim() : null, capacity, hasLoading, isActive);
                        results.stores.success++;
                    } catch (err: any) {
                        results.stores.failed++;
                        results.stores.errors.push(`Row ${idx + 2}: ${err.message}`);
                    }
                });
            }

            // Process Varieties Sheet
            const varietySheet = workbook.Sheets['varieties'];
            if (varietySheet) {
                const rows = XLSX.utils.sheet_to_json(varietySheet) as any[];
                rows.forEach((row, idx) => {
                    const variety = row.variety || row.Variety || row.name || row.Name;
                    if (!variety || String(variety).trim() === '') {
                        results.varieties.failed++;
                        results.varieties.errors.push(`Row ${idx + 2}: Variety name is required.`);
                        return;
                    }

                    const mcsPerFCL = parseInt(row.mcs_per_fcl || row.mcs || 100, 10);

                    try {
                        const cleanVariety = String(variety).trim();
                        // Check if variety exists
                        const existing = db.prepare('SELECT id FROM master_data WHERE variety = ?').get(cleanVariety);
                        if (existing) {
                            db.prepare('UPDATE master_data SET mcs_per_fcl = ? WHERE variety = ?').run(mcsPerFCL, cleanVariety);
                        } else {
                            db.prepare('INSERT INTO master_data (variety, mcs_per_fcl) VALUES (?, ?)').run(cleanVariety, mcsPerFCL);
                        }
                        results.varieties.success++;
                    } catch (err: any) {
                        results.varieties.failed++;
                        results.varieties.errors.push(`Row ${idx + 2}: ${err.message}`);
                    }
                });
            }

            // Process Grades Sheet
            const gradeSheet = workbook.Sheets['grades'];
            if (gradeSheet) {
                const rows = XLSX.utils.sheet_to_json(gradeSheet) as any[];
                rows.forEach((row, idx) => {
                    const grade = row.grade || row.Grade || row.name || row.Name;
                    if (!grade || String(grade).trim() === '') {
                        results.grades.failed++;
                        results.grades.errors.push(`Row ${idx + 2}: Grade value is required.`);
                        return;
                    }

                    try {
                        const cleanGrade = String(grade).trim();
                        const existing = db.prepare('SELECT id FROM master_data WHERE grade = ?').get(cleanGrade);
                        if (!existing) {
                            db.prepare('INSERT INTO master_data (grade) VALUES (?)').run(cleanGrade);
                        }
                        results.grades.success++;
                    } catch (err: any) {
                        results.grades.failed++;
                        results.grades.errors.push(`Row ${idx + 2}: ${err.message}`);
                    }
                });
            }

            // Process Packings Sheet
            const packingSheet = workbook.Sheets['packings'];
            if (packingSheet) {
                const rows = XLSX.utils.sheet_to_json(packingSheet) as any[];
                rows.forEach((row, idx) => {
                    const packing = row.packing || row.Packing || row.name || row.Name;
                    if (!packing || String(packing).trim() === '') {
                        results.packings.failed++;
                        results.packings.errors.push(`Row ${idx + 2}: Packing value is required.`);
                        return;
                    }

                    try {
                        const cleanPacking = String(packing).trim();
                        const existing = db.prepare('SELECT id FROM master_data WHERE packing = ?').get(cleanPacking);
                        if (!existing) {
                            db.prepare('INSERT INTO master_data (packing) VALUES (?)').run(cleanPacking);
                        }
                        results.packings.success++;
                    } catch (err: any) {
                        results.packings.failed++;
                        results.packings.errors.push(`Row ${idx + 2}: ${err.message}`);
                    }
                });
            }

            // Process Types Sheet
            const typeSheet = workbook.Sheets['types'];
            if (typeSheet) {
                const rows = XLSX.utils.sheet_to_json(typeSheet) as any[];
                rows.forEach((row, idx) => {
                    const type = row.type || row.Type || row.name || row.Name;
                    if (!type || String(type).trim() === '') {
                        results.types.failed++;
                        results.types.errors.push(`Row ${idx + 2}: Type value is required.`);
                        return;
                    }

                    try {
                        const cleanType = String(type).trim();
                        const existing = db.prepare('SELECT id FROM master_data WHERE type = ?').get(cleanType);
                        if (!existing) {
                            db.prepare('INSERT INTO master_data (type) VALUES (?)').run(cleanType);
                        }
                        results.types.success++;
                    } catch (err: any) {
                        results.types.failed++;
                        results.types.errors.push(`Row ${idx + 2}: ${err.message}`);
                    }
                });
            }
        });

        transaction();

        return NextResponse.json({ success: true, data: results });
    } catch (error: any) {
        console.error('Import master error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to parse Excel import' }, { status: 500 });
    }
}
