import Database from 'better-sqlite3';
import path from 'path';

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
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
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

  // Migration: Add barcode column to fg_stock_master
  try {
    const tableInfo = db.prepare("PRAGMA table_info(fg_stock_master)").all() as any[];
    const hasBarcode = tableInfo.some(col => col.name === 'barcode');
    if (!hasBarcode) {
      db.exec("ALTER TABLE fg_stock_master ADD COLUMN barcode TEXT");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_fg_stock_barcode ON fg_stock_master(barcode) WHERE barcode IS NOT NULL");
    }
  } catch (err) {
    console.error('Migration for barcode failed:', err);
  }


  // Purchase Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      customer TEXT,
      order_date TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
      FOREIGN KEY (moved_by_id) REFERENCES users(id),
      FOREIGN KEY (approved_by_id) REFERENCES users(id)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fg_stock_grade ON fg_stock_master(grade);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_packing ON fg_stock_master(packing_code);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_cold_store ON fg_stock_master(cold_store);
    CREATE INDEX IF NOT EXISTS idx_fg_stock_status ON fg_stock_master(status);
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
}

// Helper to close database connection (for cleanup)
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
