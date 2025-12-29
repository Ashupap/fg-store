// User types
export interface User {
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

export interface UserPublic {
    id: number;
    username?: string | null;
    email: string;
    name: string;
    role: string;

    assigned_store_ids?: number[];
    assigned_store_names?: string[];
}

// ... existing code ...

// Auth types
export interface LoginCredentials {
    username: string; // Changed from email
    password: string;
}

export interface AuthToken {
    userId: number;
    username?: string;
    email: string;
    name: string;
    role: string;
    exp: number;
}

// Master Data types
export interface MasterData {
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

// FG Stock Master types
export interface FGStockMaster {
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
}

// Stock statuses
export type StockStatus = 'Available' | 'Reserved' | 'Allocated' | 'Exported' | 'Returned';

// Purchase Order types
export interface PurchaseOrder {
    id: number;
    po_number: string;
    customer: string | null;
    order_date: string | null;
    status: string;
    created_at: string;
}

export interface POLineItem {
    id: number;
    po_id: number;
    grade: string;
    packing_code: string;
    ordered_qty: number;
    allocated_qty: number;
    created_at: string;
}

// Stock Movement types
export interface StockMovementLog {
    id: number;
    movement_id: string;
    movement_datetime: string;
    action_type: 'INWARD' | 'TRANSFER' | 'DISPATCH';
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
    status: string;
    created_at: string;
}

// Movement input types
export interface InwardMovement {
    toStore: string;
    type: string;
    variety: string;
    packing: string;
    grade: string;
    qty: number;
    remarks?: string;
}

export interface TransferMovement {
    fromStore: string;
    toStore: string;
    type: string;
    variety: string;
    packing: string;
    grade: string;
    qty: number;
}

export interface DispatchMovement {
    fromStore: string;
    type: string;
    variety: string;
    packing: string;
    grade: string;
    qty: number;
}

// Dashboard types
export interface DashboardRow {
    type: string;
    variety: string;
    grade: string;
    packingCode: string;
    packingDescription: string;
    totalMCs: number;
    availableMCs: number;
    reservedMCs: number;
    allocatedMCs: number;
    pendingPOMCs: number;
    mcsPerFCL: number;
    fcl40ft: number;
    oldestPackingDate: string | null;
    daysAging: number;
    storeBreakdown?: { store: string; count: number }[];
}

// Stock Summary types
export interface StockSummary {
    type: string;
    variety: string;
    coldStore: string;
    stock: number;
}

// API Response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface MovementResult {
    success: boolean;
    moveId?: string;
    movedCount?: number;
    notMoved?: string[];
    error?: string;
}

// Auth types
export interface LoginCredentials {
    email: string;
    password: string;
}

export interface AuthToken {
    userId: number;
    email: string;
    name: string;
    role: string;
    exp: number;
}

// PO Allocation types
export interface POLineItemInput {
    type: string;
    variety: string;
    grade: string;
    packing: string;
    qty: number;
}

export interface CreatePOInput {
    poNumber: string;
    orderDate: string;
    lineItems: POLineItemInput[];
}

export interface POLineItemWithDetails {
    id: number;
    po_id: number;
    type: string;
    variety: string;
    grade: string;
    packing_code: string;
    ordered_qty: number;
    allocated_qty: number;
    pending_qty: number;
    created_at: string;
}

export interface POWithLineItems {
    id: number;
    po_number: string;
    order_date: string | null;
    status: string;
    created_at: string;
    line_items: POLineItemWithDetails[];
    total_ordered: number;
    total_allocated: number;
    allocation_percentage: number;
}

export interface AllocationInput {
    lineItemId: number;
    qty: number;
    coldStore?: string;
}

export interface AllocationResult {
    success: boolean;
    allocatedCount?: number;
    mcNumbers?: string[];
    error?: string;
}

export interface AllocationSummary {
    grade: string;
    packingCode: string;
    type: string;
    variety: string;
    availableStock: number;
    pendingPO: number;
    shortfall: number;
}

