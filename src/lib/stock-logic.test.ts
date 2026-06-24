import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

let db: DatabaseType;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

vi.mock('@/lib/allocation', () => ({
  processGlobalPendingAllocations: vi.fn(),
}));

const { handleInward } = await import('@/lib/stock-logic');

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE fg_stock_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mc_number TEXT UNIQUE NOT NULL,
      batch_id TEXT,
      product_code TEXT,
      grade TEXT NOT NULL,
      variety TEXT,
      type TEXT,
      packing_code TEXT NOT NULL,
      packing_date TEXT NOT NULL,
      cold_store TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available',
      reserved_for_po TEXT,
      reserved_line_item TEXT,
      allocated_to_fcl TEXT,
      created_by_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      barcode TEXT UNIQUE,
      parent_mc_id INTEGER,
      is_repacked INTEGER DEFAULT 0,
      short_code TEXT,
      section_id INTEGER
    );
    CREATE TABLE stock_movement_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_id TEXT UNIQUE NOT NULL,
      movement_datetime TEXT NOT NULL,
      action_type TEXT NOT NULL,
      from_location TEXT,
      to_location TEXT,
      type TEXT,
      variety TEXT,
      packing TEXT,
      grade TEXT,
      mc_numbers TEXT,
      qty_mcs INTEGER NOT NULL DEFAULT 0,
      moved_by_id INTEGER,
      approved_by_id INTEGER,
      remarks TEXT,
      dispatch_purpose TEXT,
      po_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Pending',
      allocation_strategy TEXT DEFAULT 'FIFO'
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
});

afterAll(() => {
  db.close();
});

describe('handleInward', () => {
  it('should create stock records and movement log for valid inward', async () => {
    const result = await handleInward(
      {
        toStore: 'Store-A',
        type: 'Grapes',
        variety: 'Thompson',
        packing: '4.5 kg',
        grade: 'A',
        qty: 3,
        remarks: 'Test inward',
      },
      1
    );

    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(3);
    expect(result.moveId).toBeDefined();
    expect(result.shortCodes).toHaveLength(3);

    const stockCount = db.prepare('SELECT COUNT(*) as count FROM fg_stock_master').get() as { count: number };
    expect(stockCount.count).toBe(3);

    const movement = db.prepare('SELECT * FROM stock_movement_log WHERE movement_id = ?').get(result.moveId!) as { action_type: string; status: string; qty_mcs: number };
    expect(movement.action_type).toBe('INWARD');
    expect(movement.status).toBe('Completed');
    expect(movement.qty_mcs).toBe(3);
  });

  it('should fail validation with missing required fields', async () => {
    const result = await handleInward({ toStore: 'Store-A' }, 1);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fail when barcode count does not match qty', async () => {
    const result = await handleInward(
      {
        toStore: 'Store-A',
        type: 'Grapes',
        variety: 'Thompson',
        packing: '4.5 kg',
        grade: 'A',
        qty: 2,
        barcodes: ['BC001', 'BC002', 'BC003'],
      },
      1
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Barcode count');
  });

  it('should work with custom packingDate', async () => {
    const result = await handleInward(
      {
        toStore: 'Store-B',
        type: 'Mango',
        variety: 'Alphonso',
        packing: '10 kg',
        grade: 'B',
        qty: 1,
        packingDate: '2026-01-15',
      },
      1
    );
    expect(result.success).toBe(true);

    const stock = db.prepare('SELECT packing_date FROM fg_stock_master WHERE short_code = ?').get(result.shortCodes![0]) as { packing_date: string };
    expect(stock.packing_date).toBe('2026-01-15');
  });

  it('should update existing movement when existingMovementId provided', async () => {
    const movementId = 'MOV-TEST-EXISTING';
    db.prepare(`
      INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, qty_mcs, moved_by_id, status)
      VALUES (?, ?, 'INWARD', 'Store-A', 0, 1, 'Pending')
    `).run(movementId, new Date().toISOString());

    const result = await handleInward(
      {
        toStore: 'Store-A',
        type: 'Banana',
        variety: 'Cavendish',
        packing: '13 kg',
        grade: 'A',
        qty: 2,
      },
      1,
      movementId
    );

    expect(result.success).toBe(true);

    const movement = db.prepare('SELECT status, mc_numbers FROM stock_movement_log WHERE movement_id = ?').get(movementId) as { status: string; mc_numbers: string };
    expect(movement.status).toBe('Completed');
    expect(movement.mc_numbers.split(',')).toHaveLength(2);
  });
});
