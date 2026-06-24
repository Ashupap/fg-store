/**
 * Database row types for all SQLite tables.
 * Use these to replace 'as any' casts on db.prepare().get() / .all() calls.
 */

// ─── User ──────────────────────────────────────────────────────
export interface UserRow {
  id: number;
  username: string | null;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UserPublicRow {
  id: number;
  email: string;
  username: string | null;
  name: string;
  role: string;
}

// ─── Roles ─────────────────────────────────────────────────────
export interface RoleRow {
  id: number;
  name: string;
  permissions: string; // JSON string array
  is_system: number;
  created_at: string;
  updated_at: string;
}

// ─── Stores ────────────────────────────────────────────────────
export interface StoreRow {
  id: number;
  name: string;
  type: string;
  location: string | null;
  capacity_tons: number;
  has_loading_facility: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ─── User-Store Assignments ────────────────────────────────────
export interface UserStoreRow {
  user_id: number;
  store_id: number;
  assigned_at: string;
  assigned_by_id: number | null;
}

// ─── Store Sections ────────────────────────────────────────────
export interface StoreSectionRow {
  id: number;
  store_name: string;
  name: string;
  capacity_mcs: number;
  created_at: string;
  updated_at: string;
}

// ─── FG Stock Master ───────────────────────────────────────────
export interface StockMasterRow {
  id: number;
  mc_number: string;
  batch_id: string | null;
  product_code: string | null;
  grade: string;
  variety: string | null;
  type: string | null;
  packing_code: string;
  packing_date: string;
  cold_store: string;
  status: string;
  reserved_for_po: string | null;
  reserved_line_item: string | null;
  allocated_to_fcl: string | null;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
  barcode: string | null;
  parent_mc_id: number | null;
  is_repacked: number;
  short_code: string | null;
  section_id: number | null;
}

// ─── Purchase Orders ───────────────────────────────────────────
export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  customer: string | null;
  order_date: string | null;
  branding_type: string;
  loading_store: string | null;
  status: string;
  created_at: string;
}

// ─── PO Line Items ─────────────────────────────────────────────
export interface POLineItemRow {
  id: number;
  po_id: number;
  type: string;
  variety: string;
  grade: string;
  packing_code: string;
  ordered_qty: number;
  allocated_qty: number;
  created_at: string;
}

// ─── PO Customer Barcodes ──────────────────────────────────────
export interface POCustomerBarcodeRow {
  id: number;
  po_id: number;
  barcode: string;
  status: string;
  mc_number: string | null;
  created_at: string;
}

// ─── Stock Movement Log ────────────────────────────────────────
export interface MovementLogRow {
  id: number;
  movement_id: string;
  movement_datetime: string;
  action_type: string;
  from_location: string | null;
  to_location: string | null;
  type: string | null;
  variety: string | null;
  packing: string | null;
  grade: string | null;
  mc_numbers: string | null;
  qty_mcs: number;
  moved_by_id: number | null;
  approved_by_id: number | null;
  remarks: string | null;
  dispatch_purpose: string | null;
  po_id: number | null;
  status: string;
  created_at: string;
  allocation_strategy: string;
}

// ─── Movement Log with User Names (JOIN query) ────────────────
export interface MovementLogWithNames extends MovementLogRow {
  moved_by_name: string | null;
  approved_by_name: string | null;
}

// ─── Master Data ───────────────────────────────────────────────
export interface MasterDataRow {
  id: number;
  grade: string | null;
  variety: string | null;
  packing: string | null;
  type: string | null;
  cold_store: string | null;
  mcs_per_fcl: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Audit Logs ────────────────────────────────────────────────
export interface AuditLogRow {
  id: number;
  action_type: string;
  table_name: string;
  record_id: string;
  before_state: string; // JSON
  after_state: string;  // JSON
  changed_by_id: number;
  changed_by_name: string;
  change_reason: string;
  timestamp: string;
}

// ─── Settings ──────────────────────────────────────────────────
export interface SettingRow {
  key: string;
  value: string | null;
  updated_at: string;
}

// ─── System Settings ───────────────────────────────────────────
export interface SystemSettingRow {
  key: string;
  value: string | null;
}

// ─── Carton Sequence ───────────────────────────────────────────
export interface CartonSequenceRow {
  id: number;
  created_at: string;
}

// ─── Common Query Result Types ─────────────────────────────────
export interface CountResult {
  count: number;
}

export interface SumResult {
  total: number;
}

// ─── Stock Carton (for allocation and movement) ────────────────
export interface CartonRow {
  id: number;
  mc_number: string;
  grade: string;
  variety: string;
  type: string;
  packing_code: string;
  packing_date: string;
  cold_store: string;
  status: string;
  barcode?: string;
  short_code?: string;
}

// ─── Pending Movement Request ──────────────────────────────────
export interface PendingMovementRow {
  movement_id: string;
  mc_numbers: string | null;
  qty_mcs: number;
  type: string | null;
  variety: string | null;
  packing: string | null;
  grade: string | null;
  allocation_strategy: string;
}

// ─── Section Occupancy ─────────────────────────────────────────
export interface SectionOccupancyRow {
  section_id: number;
  count: number;
}

// ─── Section Info ──────────────────────────────────────────────
export interface SectionInfoRow {
  id: number;
  name: string;
  capacity_mcs: number;
}

// ─── PO with Line Items (aggregated query) ─────────────────────
export interface POWithLineItemsRow {
  id: number;
  po_number: string;
  customer: string | null;
  order_date: string | null;
  branding_type: string;
  loading_store: string | null;
  status: string;
  created_at: string;
  line_items: string; // JSON array
  total_ordered: number;
  total_allocated: number;
}

// ─── Dashboard Aggregation Row ─────────────────────────────────
export interface DashboardAggRow {
  type: string;
  variety: string;
  grade: string;
  packing_code: string;
  count: number;
  available: number;
  reserved: number;
  allocated: number;
}

// ─── Stock Filter Option ───────────────────────────────────────
export interface StockFilterOptionRow {
  value: string;
}

// ─── Batch by Date Row ─────────────────────────────────────────
export interface BatchByDateRow {
  packing_date: string;
  count: number;
  mc_numbers: string;
}

// ─── PRAGMA table_info result ───────────────────────────────────
export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}
