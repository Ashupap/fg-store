import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';

function calculateWeightPerMC(packingStr: string): number {
    const regex = /(\d+)\s*[xX]\s*([\d\.]+)\s*([a-zA-Z]+)/i;
    const match = packingStr.match(regex);

    if (match) {
        const count = parseFloat(match[1]);
        const unitWeight = parseFloat(match[2]);
        const unit = match[3].toUpperCase();

        let totalWeightKg = 0;

        if (unit.startsWith('LB')) {
            totalWeightKg = count * unitWeight * 0.453592;
        } else if (unit.startsWith('KG')) {
            totalWeightKg = count * unitWeight;
        } else if (unit.startsWith('GM') || unit.startsWith('G')) {
            totalWeightKg = (count * unitWeight) / 1000;
        } else {
            totalWeightKg = count * unitWeight;
        }
        return totalWeightKg / 1000; // to Tons
    }

    const simpleRegex = /([\d\.]+)\s*([a-zA-Z]+)/i;
    const simpleMatch = packingStr.match(simpleRegex);
    if (simpleMatch) {
        const weight = parseFloat(simpleMatch[1]);
        const unit = simpleMatch[2].toUpperCase();
        let weightKg = weight;
        if (unit.startsWith('LB')) weightKg = weight * 0.453592;
        else if (unit.startsWith('GM') || unit.startsWith('G')) weightKg = weight / 1000;
        return weightKg / 1000; // to Tons
    }

    return 0.01; // Default
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'reports:view')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');

        const db = getDb();

        // 1. Fetch completed REPACK_IN movement logs
        let query = `
            SELECT id, movement_id, movement_datetime, from_location, to_location, type, variety, packing, grade, qty_mcs, mc_numbers, remarks, po_id
            FROM stock_movement_log
            WHERE action_type = 'REPACK_IN' AND status = 'Completed'
        `;
        const params: any[] = [];

        if (fromDate) {
            query += ' AND movement_datetime >= ?';
            params.push(`${fromDate}T00:00:00.000Z`);
        }
        if (toDate) {
            query += ' AND movement_datetime <= ?';
            params.push(`${toDate}T23:59:59.999Z`);
        }

        query += ' ORDER BY movement_datetime DESC';
        const repackInLogs = db.prepare(query).all(...params) as any[];

        // 2. Map original parents and calculate yield details for each job
        const reportData = repackInLogs.map(log => {
            const childMCsList = log.mc_numbers ? log.mc_numbers.split(',') : [];

            // Query parents of these children from stock master
            const placeholders = childMCsList.map(() => '?').join(',');
            const parentStock = db.prepare(`
                SELECT parent.mc_number, parent.variety, parent.grade, parent.packing_code, parent.type
                FROM fg_stock_master child
                JOIN fg_stock_master parent ON child.parent_mc_id = parent.id
                WHERE child.mc_number IN (${placeholders})
            `).all(...childMCsList) as any[];

            // Group parents by SKU to calculate input weight
            const parentGroups: Record<string, { count: number; packing: string; variety: string; type: string; grade: string }> = {};
            parentStock.forEach(p => {
                const key = `${p.variety}|${p.packing_code}|${p.grade}`;
                if (!parentGroups[key]) {
                    parentGroups[key] = { count: 0, packing: p.packing_code, variety: p.variety, type: p.type, grade: p.grade };
                }
                parentGroups[key].count++;
            });

            let inputWeightTons = 0;
            const inputs = Object.values(parentGroups).map(g => {
                const weight = g.count * calculateWeightPerMC(g.packing);
                inputWeightTons += weight;
                return {
                    variety: g.variety,
                    grade: g.grade,
                    packing: g.packing,
                    qty: g.count,
                    weightTons: Math.round(weight * 1000) / 1000
                };
            });

            // Output Calculations (Child)
            const outputWeightTons = childMCsList.length * calculateWeightPerMC(log.packing || '10KG');
            const output = {
                variety: log.variety,
                grade: log.grade,
                packing: log.packing,
                qty: childMCsList.length,
                weightTons: Math.round(outputWeightTons * 1000) / 1000
            };

            const lossWeightTons = inputWeightTons - outputWeightTons;
            const yieldPct = inputWeightTons > 0 ? (outputWeightTons / inputWeightTons) * 100 : 100;

            // Fetch PO number if linked
            let poNumber = 'N/A';
            if (log.po_id) {
                const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(log.po_id) as any;
                if (po) poNumber = po.po_number;
            }

            return {
                movementId: log.movement_id,
                date: log.movement_datetime.split('T')[0],
                poNumber,
                remarks: log.remarks,
                inputs,
                output,
                inputTotalWeightTons: Math.round(inputWeightTons * 1000) / 1000,
                outputTotalWeightTons: Math.round(outputWeightTons * 1000) / 1000,
                lossWeightTons: Math.round(lossWeightTons * 1000) / 1000,
                yieldPct: Math.round(yieldPct * 100) / 100
            };
        });

        return NextResponse.json({ success: true, data: reportData });
    } catch (error: any) {
        console.error('Yield report error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate yield analysis report' }, { status: 500 });
    }
}
