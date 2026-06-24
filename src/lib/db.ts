import Database from 'better-sqlite3';
import path from 'path';
import type { ColumnInfo } from '@/lib/db-types';

// Database file path
const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');

// Create a singleton database connection
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Initialize tables
    initializeTables(db);
  }
  return db;
}

function initializeTables(db: Database.Database) {
  // Users table
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

  // Migration: Add username column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as ColumnInfo[];
    const hasUsername = tableInfo.some(col => col.name === 'username');
    if (!hasUsername) {
      // SQLite does not support adding UNIQUE columns directly via ALTER TABLE
      db.exec("ALTER TABLE users ADD COLUMN username TEXT");

      // Populate username from email (prefix before @)
      db.exec("UPDATE users SET username = SUBSTR(email, 1, INSTR(email, '@') - 1) WHERE username IS NULL");

      // Create unique index
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    }
  } catch (err) {
    console.error('Migration failed:', err);
  }

  // SEED: Default Admin User
  const adminExists = db.prepare("SELECT count(*) as count FROM users WHERE username = 'admin'").get() as { count: number };
  if (adminExists.count === 0) {
    console.log('Seeding default admin user...');
    db.prepare(`
          INSERT INTO users (username, email, password_hash, name, role)
          VALUES (?, ?, ?, ?, ?)
      `).run('admin', 'admin@fgstore.com', '$2b$10$W54X5OXCm03OLBT1xLDuw.2aYBA8n7OOUAX1.OOLUUQFTpdnd4zKtS', 'System Admin', 'admin');
  }

  // Master Data table
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

  // FG Stock Master table
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
      FOREIGN KEY (created_by_id) REFERENCES users(id)
    )
  `);

  // Migration: Add barcode and repacking columns to fg_stock_master
  try {
    const tableInfo = db.prepare("PRAGMA table_info(fg_stock_master)").all() as ColumnInfo[];
    
    // Barcode migration
    const hasBarcode = tableInfo.some(col => col.name === 'barcode');
    if (!hasBarcode) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN barcode TEXT");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_fg_stock_barcode ON fg_stock_master(barcode) WHERE barcode IS NOT NULL");
    }

    // Repacking migrations
    const hasParentMcId = tableInfo.some(col => col.name === 'parent_mc_id');
    if (!hasParentMcId) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN parent_mc_id INTEGER REFERENCES fg_stock_master(id)");
    }

    const hasIsRepacked = tableInfo.some(col => col.name === 'is_repacked');
    if (!hasIsRepacked) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN is_repacked INTEGER DEFAULT 0");
    }

    // Short code migration
    const hasShortCode = tableInfo.some(col => col.name === 'short_code');
    if (!hasShortCode) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN short_code TEXT");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_fg_stock_short_code ON fg_stock_master(short_code) WHERE short_code IS NOT NULL");
    }

    // Carton sequence table
    db.exec(`
      CREATE TABLE IF NOT EXISTS carton_sequence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Migration for fg_stock_master columns failed:', err);
  }


  // Purchase Orders table
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

  // Migration: Add branding_type and loading_store to purchase_orders
  try {
    const tableInfo = db.prepare("PRAGMA table_info(purchase_orders)").all() as ColumnInfo[];
    
    const hasBrandingType = tableInfo.some(col => col.name === 'branding_type');
    if (!hasBrandingType) {
      db.exec("ALTER TABLE purchase_orders ADD COLUMN branding_type TEXT DEFAULT 'Demo'");
    }

    const hasLoadingStore = tableInfo.some(col => col.name === 'loading_store');
    if (!hasLoadingStore) {
      db.exec("ALTER TABLE purchase_orders ADD COLUMN loading_store TEXT");
    }
  } catch (err) {
    console.error('Migration for purchase_orders columns failed:', err);
  }

  // PO Customer Barcodes table
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

  // PO Line Items table
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

  // Stock Movement Log table
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
      allocation_strategy TEXT DEFAULT 'FIFO',
      FOREIGN KEY (moved_by_id) REFERENCES users(id),
      FOREIGN KEY (approved_by_id) REFERENCES users(id)
    )
  `);

  // Migration: Add allocation_strategy column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(stock_movement_log)").all() as ColumnInfo[];
    const hasAllocationStrategy = tableInfo.some(col => col.name === 'allocation_strategy');
    if (!hasAllocationStrategy) {
      db.exec("ALTER TABLE stock_movement_log ADD COLUMN allocation_strategy TEXT DEFAULT 'FIFO'");
    }
  } catch (err) {
    console.error('Migration for allocation_strategy failed:', err);
  }

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fg_stock_grade ON fg_stock_master(grade);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_packing ON fg_stock_master(packing_code);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_cold_store ON fg_stock_master(cold_store);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_status ON fg_stock_master(status);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_parent ON fg_stock_master(parent_mc_id);
    CREATE INDEX IF NOT EXISTS idx_movement_action ON stock_movement_log(action_type);
    CREATE INDEX IF NOT EXISTS idx_movement_datetime ON stock_movement_log(movement_datetime);
  `);

  // Stores table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'Cold Store',
      location TEXT,
      capacity_tons REAL DEFAULT 0,
      has_loading_facility INTEGER DEFAULT 0, -- Boolean: 0 or 1
      is_active INTEGER DEFAULT 1,           -- Boolean: 0 or 1
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User-Store Assignments table
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

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      permissions TEXT NOT NULL, -- JSON string array of permission keys
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default roles if empty
  const rolesCount = db.prepare("SELECT count(*) as count FROM roles").get() as { count: number };
  if (rolesCount.count === 0) {
    console.log('Seeding default roles...');
    const seedRole = db.prepare("INSERT INTO roles (name, permissions, is_system) VALUES (?, ?, ?)");
    seedRole.run('admin', JSON.stringify(['*']), 1);
    seedRole.run('general_manager', JSON.stringify([
      'master:manage',
      'transfer:approve',
      'po:manage',
      'po:allocate',
      'shipment:manage',
      'shipment:scan',
      'reports:view',
      'transaction:update'
    ]), 1);
    seedRole.run('marketing_manager', JSON.stringify([
      'po:manage',
      'po:allocate',
      'reports:view'
    ]), 1);
    seedRole.run('manager', JSON.stringify([
      'transfer:approve',
      'transfer:accept',
      'reports:view'
    ]), 1);
    seedRole.run('operator', JSON.stringify([
      'inward:create',
      'transfer:initiate'
    ]), 1);
  }

  // Audit Logs table for tracking transaction corrections
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
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (changed_by_id) REFERENCES users(id)
    )
  `);

  // Store Sections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity_mcs INTEGER NOT NULL DEFAULT 500,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_name) REFERENCES stores(name) ON DELETE CASCADE,
      UNIQUE(store_name, name)
    )
  `);

  // Migration: Add section_id to fg_stock_master
  try {
    const tableInfo = db.prepare("PRAGMA table_info(fg_stock_master)").all() as ColumnInfo[];
    const hasSectionId = tableInfo.some(col => col.name === 'section_id');
    if (!hasSectionId) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN section_id INTEGER REFERENCES store_sections(id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_fg_stock_section ON fg_stock_master(section_id)");
    }
  } catch (err) {
    console.error('Migration for section_id failed:', err);
  }

  // Pre-seed default sections (A, B, C, D) for active stores
  try {
    const activeStores = db.prepare("SELECT name FROM stores WHERE is_active = 1").all() as { name: string }[];
    const insertSection = db.prepare(`
      INSERT OR IGNORE INTO store_sections (store_name, name, capacity_mcs)
      VALUES (?, ?, 500)
    `);
    for (const store of activeStores) {
      insertSection.run(store.name, 'Section A');
      insertSection.run(store.name, 'Section B');
      insertSection.run(store.name, 'Section C');
      insertSection.run(store.name, 'Section D');
    }
  } catch (err) {
    console.error('Pre-seeding default sections failed:', err);
  }
}

// Helper to close database connection (for cleanup)
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
