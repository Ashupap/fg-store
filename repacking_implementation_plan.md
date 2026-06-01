# Implementation Plan - Repacking Workflow

This document outlines the strategy for implementing the **Repacking Feature**, which manages the transformation of seafood products from generic (dummy) packaging to specific customer-labeled packaging.

## 1. Business Logic & State Machine

### A. The "To Production" Phase (Repack Out)
*   **Action**: Sending stock from the Cold Store to the Production Floor for repacking.
*   **Trigger**: Triggered after PO Allocation. Marketing Manager allocates "Dummy" stock, which is then moved to production.
*   **Stock State**: Status changes from `Allocated` to `In Repacking`.
*   **Allocation Persistence**: The system **preserves** the `reserved_for_po` and `reserved_line_item` metadata during this transition.
*   **Validation**: Only stock already `Allocated` to a PO (or specifically selected `Available` stock) is eligible.

### B. The "Transformation" Phase
*   **Action**: Product is physically repacked.
*   **System Logic**: The original Master Cartons (MCs) are marked as "Consumed" or "Repacked". Their inventory presence in the store is removed.

### C. The "Back to Store" Phase (Repack In)
*   **Action**: Repacked product returns to the Cold Store.
*   **New Record Creation**: New MC numbers (barcodes) are generated for the customer-labeled packets.
*   **Inheritance**: The new MCs inherit the `Variety`, `Grade`, `Batch ID`, **AND the PO Allocation metadata** (`reserved_for_po`, `reserved_line_item`) of the original stock.
*   **Packing Update**: The `packing_code` is updated to the customer-specific label.
*   **Traceability**: Each new MC maintains a `parent_mc_id` link to the original dummy MC.
*   **Final State**: Status returns to `Allocated` (or `Available` if it wasn't pre-allocated).

---

## 2. Technical Changes

### A. Database Schema Updates (`src/lib/db.ts`)
*   **`fg_stock_master` table**:
    *   Add `status` value: `'In Repacking'`.
    *   Add `parent_mc_id` (INTEGER): Foreign key to the original MC.
    *   Add `is_repacked` (INTEGER/Boolean): Flag for quick filtering.
*   **`stock_movement_log` table**:
    *   Add `action_type` values: `'REPACK_OUT'` and `'REPACK_IN'`.

### B. API Endpoints (`src/app/api/`)
*   **[NEW] `POST /api/movement/repack/start`**:
    *   Payload: `mc_numbers: string[]`, `target_po_id?: number`.
    *   Logic: Moves MCs to `In Repacking` status and logs the movement to "Production".
*   **[NEW] `POST /api/movement/repack/complete`**:
    *   Payload: `original_mc_numbers: string[]`, `new_mcs: Array<{ mc_number: string, packing_code: string, qty: number }>`, `to_store: string`.
    *   Logic: Creates new MC records, links them to parents, and logs the return movement.

### C. UI Components
*   **Repacking Manager**: A new tab in the Stock Movement page.
*   **Active Jobs**: List of stock currently in production.
*   **Initiate Button**: Opens a modal to select "Dummy" stock to send to production.
*   **Complete Button**: A specialized form to scan in the new labeled MCs and link them to the departing production batch.

---

## 3. Traceability & Reporting
*   **Lineage View**: On the Stock Detail page, add a "Genealogy" section showing the history of the product (e.g., "This MC was repacked from Dummy MC-998 on 2026-05-15").
*   **Yield Report**: Compare the total weight/quantity sent to repacking vs. the total weight/quantity returned to identify any loss during the process.

## 4. Business Rule Confirmation

> [!IMPORTANT]
> **Preserved Allocation Logic**: This implementation ensures that once a PO is entered and stock is allocated, that specific "bond" between the inventory and the customer order is never broken, even as the physical packaging changes. 
> 
> **Weight/Quantity Consistency**: If 1 Dummy MC is repacked into 10 Retail Packs, all 10 new packs will be automatically allocated to the same PO line item that the parent was reserved for.

---
*Plan prepared by Antigravity AI.*
