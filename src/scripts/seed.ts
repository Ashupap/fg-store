// Seed script for initial data
// Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' src/scripts/seed.ts

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'fg-store.db');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🌱 Starting database seed...\n');

// Create tables
console.log('📦 Creating tables...');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    FOREIGN KEY (created_by_id) REFERENCES users(id)
  )
`);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS po_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
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
    status TEXT DEFAULT 'Completed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (moved_by_id) REFERENCES users(id),
    FOREIGN KEY (approved_by_id) REFERENCES users(id)
  )
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_fg_stock_grade ON fg_stock_master(grade);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_packing ON fg_stock_master(packing_code);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_cold_store ON fg_stock_master(cold_store);
  CREATE INDEX IF NOT EXISTS idx_fg_stock_status ON fg_stock_master(status);
  CREATE INDEX IF NOT EXISTS idx_movement_action ON stock_movement_log(action_type);
  CREATE INDEX IF NOT EXISTS idx_movement_datetime ON stock_movement_log(movement_datetime);
`);

console.log('✅ Tables created\n');

// Seed users
console.log('👤 Creating test users...');

const passwordHash = bcrypt.hashSync('password123', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (email, password_hash, name, role)
  VALUES (?, ?, ?, ?)
`);

insertUser.run('admin@fgstore.com', passwordHash, 'Admin User', 'admin');
insertUser.run('operator@fgstore.com', passwordHash, 'Store Operator', 'operator');
insertUser.run('supervisor@fgstore.com', passwordHash, 'Production Supervisor', 'supervisor');

console.log('✅ Users created:');
console.log('   - admin@fgstore.com (password: password123)');
console.log('   - operator@fgstore.com (password: password123)');
console.log('   - supervisor@fgstore.com (password: password123)\n');

// Seed master data
console.log('📋 Seeding master data...');

const insertMasterData = db.prepare(`
  INSERT INTO master_data (grade, variety, packing, type, cold_store, mcs_per_fcl)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Grades
const grades = ['6/8', '8/12', '13/15', '16/20', '21/25', '26/30', '31/40', '41/50', '51/60', '61/70'];
// Varieties
const varieties = ['PDTO', 'PD', 'HL IQF', 'PD (NP)', 'G 1', 'G 2', 'PV PD', 'HLSO', 'P&D'];
// Packing types
const packings = [
    { name: '5 X 2 LBS', mcs: 120 },
    { name: '1 X 10 KGS', mcs: 100 },
    { name: '10 X 2 LBS', mcs: 60 },
    { name: '6 X 1.8 KG', mcs: 85 },
    { name: '4 X 2.5 KG', mcs: 90 },
    { name: '2 X 5 KG', mcs: 100 },
];
// Types
const types = ['IQF', 'SLAB'];
// Cold Stores
const coldStores = ['AME', 'BME', 'BBSR', 'KURUDA', 'PLANT-A', 'PLANT-B'];

// Insert combinations
let insertCount = 0;
for (const grade of grades) {
    for (const packing of packings) {
        for (const type of types) {
            for (const coldStore of coldStores) {
                insertMasterData.run(grade, null, packing.name, type, coldStore, packing.mcs);
                insertCount++;
            }
        }
    }
}

// Insert varieties separately
for (const variety of varieties) {
    insertMasterData.run(null, variety, null, null, null, null);
}

console.log(`✅ Inserted ${insertCount} master data records`);
console.log(`   Grades: ${grades.join(', ')}`);
console.log(`   Varieties: ${varieties.join(', ')}`);
console.log(`   Types: ${types.join(', ')}`);
console.log(`   Cold Stores: ${coldStores.join(', ')}\n`);

// Seed some sample stock for demo
console.log('📦 Creating sample stock data...');

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

const insertStock = db.prepare(`
  INSERT INTO fg_stock_master (mc_number, grade, variety, type, packing_code, packing_date, cold_store, status, created_by_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const sampleStocks = [
    { grade: '6/8', variety: 'PDTO', type: 'IQF', packing: '5X2LBS', store: 'AME', date: today, qty: 50 },
    { grade: '8/12', variety: 'PD', type: 'IQF', packing: '5X2LBS', store: 'AME', date: yesterday, qty: 30 },
    { grade: '13/15', variety: 'PDTO', type: 'SLAB', packing: '1X10KGS', store: 'BME', date: lastWeek, qty: 45 },
    { grade: '16/20', variety: 'HL IQF', type: 'IQF', packing: '10X2LBS', store: 'BBSR', date: yesterday, qty: 25 },
    { grade: '21/25', variety: 'PD', type: 'IQF', packing: '6X1.8KG', store: 'KURUDA', date: today, qty: 35 },
];

let stockCount = 0;
for (const stock of sampleStocks) {
    for (let i = 1; i <= stock.qty; i++) {
        const mcNumber = `MC-${stock.grade.replace('/', '-')}-${stock.packing}-${String(i).padStart(4, '0')}`;
        try {
            insertStock.run(mcNumber, stock.grade, stock.variety, stock.type, stock.packing, stock.date, stock.store, 'Available');
            stockCount++;
        } catch (e) {
            // Ignore duplicates
        }
    }
}

console.log(`✅ Created ${stockCount} sample stock MCs\n`);

// Log a sample movement
console.log('📝 Creating sample movement log...');

const insertMovement = db.prepare(`
  INSERT INTO stock_movement_log (movement_id, movement_datetime, action_type, to_location, type, variety, packing, grade, qty_mcs, moved_by_id, status)
  VALUES (?, ?, 'INWARD', ?, ?, ?, ?, ?, ?, 1, 'Completed')
`);

insertMovement.run(
    'MOV-20231211120000',
    new Date().toISOString(),
    'AME',
    'IQF',
    'PDTO',
    '5 X 2 LBS',
    '6/8',
    50
);

console.log('✅ Sample movement logged\n');

db.close();

console.log('🎉 Database seeded successfully!');
console.log(`📁 Database file: ${dbPath}`);
