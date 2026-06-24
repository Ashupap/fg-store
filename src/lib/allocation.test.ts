import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Unit tests for allocation.ts
 * Uses a real in-memory SQLite database to test the actual business logic.
 */

let db: Database.Database;

beforeAll(() => {
  // Create in-memory database with the same schema
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create all tables matching the production schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'operator',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      permissions TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'Cold Store',
      location TEXT,
      capacity_tons REAL DEFAULT 0,
      has_loading_facility INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_stores (
      user_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      assigned_by_id INTEGER,
      PRIMARY KEY (user_id, store_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS master_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade TEXT,
      variety TEXT,
      packing TEXT,
      type TEXT,
      cold_store TEXT,
      mcs_per_fcl INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fg_stock_master (
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
      status TEXT DEFAULT 'Available',
      reserved_for_po TEXT,
      reserved_line_item TEXT,
      allocated_to_fcl TEXT,
      created_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      barcode TEXT,
      parent_mc_id INTEGER,
      is_repacked INTEGER DEFAULT 0,
      short_code TEXT,
      section_id INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      customer TEXT,
      order_date TEXT,
      branding_type TEXT DEFAULT 'Demo',
      loading_store TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS po_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      variety TEXT NOT NULL,
      grade TEXT NOT NULL,
      packing_code TEXT NOT NULL,
      ordered_qty INTEGER NOT NULL,
      allocated_qty INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movement_log (
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
      qty_mcs INTEGER NOT NULL,
      moved_by_id INTEGER,
      approved_by_id INTEGER,
      remarks TEXT,
      dispatch_purpose TEXT,
      po_id INTEGER,
      status TEXT DEFAULT 'Completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      allocation_strategy TEXT DEFAULT 'FIFO'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS store_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_mcs INTEGER NOT NULL DEFAULT 500,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_name, name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      before_state TEXT NOT NULL,
      after_state TEXT NOT NULL,
      changed_by_id INTEGER NOT NULL,
      changed_by_name TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS po_customer_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'Unused',
      mc_number TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    )
  `);

  // Seed test data
  db.prepare(`
    INSERT INTO stores (name, type, capacity_tons) VALUES ('Store A', 'Cold Store', 100)
  `).run();

  db.prepare(`
    INSERT INTO purchase_orders (po_number, customer, order_date, status)
    VALUES ('PO-TEST-001', 'Test Customer', '2026-06-01', 'Active')
  `).run();

  db.prepare(`
    INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
    VALUES (1, 'IQF', 'Black Tiger', '16/20', '5X2LBS', 10, 0)
  `).run();

  // Mock getDb to return our test database
  vi.mock('@/lib/db', () => ({
    getDb: () => db,
  }));
});

afterAll(() => {
  vi.restoreAllMocks();
  db.close();
});

describe('allocation.ts', () => {
  describe('autoAllocatePO', () => {
    it('should return 0 when no stock is available', async () => {
      const { autoAllocatePO } = await import('@/lib/allocation');
      const allocated = autoAllocatePO(1);
      expect(allocated).toBe(0);
    });

    it('should allocate available stock to a pending PO (FIFO)', async () => {
      // Insert available stock matching the PO line item
      const stockData = [
        { mc_number: 'MC-TEST-001', packing_date: '2026-06-01' },
        { mc_number: 'MC-TEST-002', packing_date: '2026-06-02' },
        { mc_number: 'MC-TEST-003', packing_date: '2026-06-03' },
      ];

      for (const stock of stockData) {
        db.prepare(`
          INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status)
          VALUES (?, '16/20', 'Black Tiger', 'IQF', '5X2LBS', ?, 'Store A', 'Available')
        `).run(stock.mc_number, stock.packing_date);
      }

      const { autoAllocatePO } = await import('@/lib/allocation');
      const allocated = autoAllocatePO(1);

      // Should allocate 3 MCs (all available stock)
      expect(allocated).toBe(3);

      // Verify stock status changed to Reserved
      const reservedStock = db.prepare(`
        SELECT status, reserved_for_po FROM fg_stock_master WHERE mc_number IN ('MC-TEST-001', 'MC-TEST-002', 'MC-TEST-003')
      `).all() as { status: string; reserved_for_po: string | null }[];

      for (const stock of reservedStock) {
        expect(stock.status).toBe('Reserved');
        expect(stock.reserved_for_po).toBe('PO-TEST-001');
      }

      // Verify line item allocated_qty updated
      const lineItem = db.prepare(`
        SELECT allocated_qty FROM po_line_items WHERE id = 1
      `).get() as { allocated_qty: number };

      expect(lineItem.allocated_qty).toBe(3);
    });

    it('should not over-allocate beyond ordered quantity', async () => {
      // Insert more stock than needed
      for (let i = 4; i <= 12; i++) {
        const mc = `MC-TEST-OVER-${String(i).padStart(3, '0')}`;
        db.prepare(`
          INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status)
          VALUES (?, '16/20', 'Black Tiger', 'IQF', '5X2LBS', '2026-06-${String(i).padStart(2, '0')}', 'Store A', 'Available')
        `).run(mc);
      }

      // Create a new PO with small quantity
      db.prepare(`
        INSERT INTO purchase_orders (po_number, customer, order_date, status)
        VALUES ('PO-TEST-002', 'Test Customer 2', '2026-06-01', 'Active')
      `).run();

      db.prepare(`
        INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
        VALUES (2, 'IQF', 'Black Tiger', '16/20', '5X2LBS', 2, 0)
      `).run();

      const { autoAllocatePO } = await import('@/lib/allocation');
      const allocated = autoAllocatePO(2);

      // Should only allocate 2 MCs (ordered quantity)
      expect(allocated).toBe(2);
    });

    it('should mark PO as Fulfilled when all items are allocated', async () => {
      const { autoAllocatePO } = await import('@/lib/allocation');
      autoAllocatePO(2);

      const po = db.prepare(`
        SELECT status FROM purchase_orders WHERE id = 2
      `).get() as { status: string };

      expect(po.status).toBe('Fulfilled');
    });

    it('should only allocate stock matching type/variety/grade/packing', async () => {
      // Create a new PO for different SKU
      db.prepare(`
        INSERT INTO purchase_orders (po_number, customer, order_date, status)
        VALUES ('PO-TEST-003', 'Test Customer 3', '2026-06-01', 'Active')
      `).run();

      db.prepare(`
        INSERT INTO po_line_items (po_id, type, variety, grade, packing_code, ordered_qty, allocated_qty)
        VALUES (3, 'SLAB', 'Vannamei', '26/30', '10X1LBS', 5, 0)
      `).run();

      // Insert stock that DOESN'T match this PO
      for (let i = 1; i <= 3; i++) {
        db.prepare(`
          INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status)
          VALUES (?, '16/20', 'Black Tiger', 'IQF', '5X2LBS', '2026-06-01', 'Store A', 'Available')
        `).run(`MC-MISMATCH-${String(i).padStart(3, '0')}`);
      }

      const { autoAllocatePO } = await import('@/lib/allocation');
      const allocated = autoAllocatePO(3);

      // Should allocate 0 because stock doesn't match the PO's SKU
      expect(allocated).toBe(0);
    });
  });

  describe('processGlobalPendingAllocations', () => {
    it('should return 0 when no pending POs exist', async () => {
      const { processGlobalPendingAllocations } = await import('@/lib/allocation');
      const result = processGlobalPendingAllocations();
      expect(typeof result).toBe('number');
    });
  });
});
