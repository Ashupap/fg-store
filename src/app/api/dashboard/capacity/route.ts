import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

function calculateWeightPerMC(packingStr: string): number {
    // Expected formats: "5 X 2 KG", "10 X 1 LBS", "1 X 10 KG"
    // Regex to capture Count, Unit Weight, and Unit
    const regex = /(\d+)\s*[xX]\s*([\d\.]+)\s*([a-zA-Z]+)/i;
    const match = packingStr.match(regex);

    if (match) {
        const count = parseFloat(match[1]);
        const unitWeight = parseFloat(match[2]);
        const unit = match[3].toUpperCase();

        let totalWeightKg = 0;

        if (unit.startsWith('LB')) {
            // Lbs to Kg
            totalWeightKg = count * unitWeight * 0.453592;
        } else if (unit.startsWith('KG')) {
            // Kg
            totalWeightKg = count * unitWeight;
        } else if (unit.startsWith('GM') || unit.startsWith('G')) {
            // Grams
            totalWeightKg = (count * unitWeight) / 1000;
        } else {
            // Default to KG if unknown (safest bet)
            totalWeightKg = count * unitWeight;
        }

        // Convert Kg to Tons
        return totalWeightKg / 1000;
    }

    // Fallback: If packing string is just "10KG" or "20LBS"
    const simpleRegex = /([\d\.]+)\s*([a-zA-Z]+)/i;
    const simpleMatch = packingStr.match(simpleRegex);
    if (simpleMatch) {
        const weight = parseFloat(simpleMatch[1]);
        const unit = simpleMatch[2].toUpperCase();
        let weightKg = weight;
        if (unit.startsWith('LB')) weightKg = weight * 0.453592;
        else if (unit.startsWith('GM') || unit.startsWith('G')) weightKg = weight / 1000;

        return weightKg / 1000;
    }

    return 0.01; // Default 10kg if parsing fails
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        if (user.role === 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
        const db = getDb();

        // 1. Get Stores
        const storeQuery = 'SELECT id, name, capacity_tons, type FROM stores WHERE is_active = 1';
        const stores = db.prepare(storeQuery).all() as { id: number; name: string; capacity_tons: number; type: string }[];

        if (stores.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // 2. Get Stock Counts grouped by Store, Variety, and Packing
        const stockQuery = `
            SELECT 
                cold_store, 
                variety,
                packing_code,
                COUNT(*) as count 
            FROM fg_stock_master 
            WHERE status IN ('Available', 'Reserved', 'Allocated') AND cold_store IS NOT NULL AND cold_store != ''
            GROUP BY cold_store, variety, packing_code
        `;
        const stockData = db.prepare(stockQuery).all() as { cold_store: string; variety: string; packing_code: string; count: number }[];

        // 3. Get Packing details from Master Data
        // Map: Variety|PackingCode -> Packing String (e.g. "5 X 2 LBS")
        const masterData = db.prepare('SELECT variety, packing FROM master_data').all() as { variety: string; packing: string }[];

        const packingMap = new Map<string, string>();
        masterData.forEach(md => {
            if (md.packing) {
                const pCode = md.packing.replace(/\s+/g, '').toUpperCase();
                const key = `${md.variety}|${pCode}`;
                packingMap.set(key, md.packing);
            }
        });

        // 4. Calculate Utilization per Store
        const capacityData = stores.map(store => {
            const storeStock = stockData.filter(s => s.cold_store === store.name);

            let usedTons = 0;
            let totalMCs = 0;

            storeStock.forEach(item => {
                const key = `${item.variety}|${item.packing_code}`;

                // Try to find the original packing string
                // Fallbacks:
                // 1. Exact match in master data (Variety + PCode)
                // 2. Just the Packing Code itself (e.g. "5X2LBS" - might work with flexible regex)
                // 3. Default

                let packingString = packingMap.get(key);
                if (!packingString) {
                    // Try to construct likely packing string from code if missing in master
                    // e.g. 5X2LBS -> 5 X 2 LBS
                    packingString = item.packing_code;
                }

                const weightPerMC = calculateWeightPerMC(packingString || '10KG');

                usedTons += item.count * weightPerMC;
                totalMCs += item.count;
            });

            return {
                id: store.id,
                name: store.name,
                capacityTons: store.capacity_tons || 0,
                usedTons: Math.round(usedTons * 100) / 100,
                totalMCs,
                type: store.type
            };
        });

        return NextResponse.json({ success: true, data: capacityData });

    } catch (error) {
        console.error('Capacity API Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch capacity data' }, { status: 500 });
    }
}
