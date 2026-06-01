# FGStore - Detailed Business Logic & Flow

This document outlines the core business principles, operational workflows, and data-driven rules that govern the FGStore management system.

---

## 1. The Core Business Entities
*   **Master Carton (MC)**: The atomic unit of inventory. Every movement and allocation is tracked at the MC level.
*   **Stock Item (SKU)**: Defined by the combination of **Type** (IQF/Slab), **Variety** (e.g., Black Tiger Shrimp), **Grade** (e.g., 16/20), and **Packing** (e.g., 10x1kg).
*   **Store**: A physical location with a specific **Capacity (Tons)** and **Type** (Processing Unit vs. Cold Store).
*   **Purchase Order (PO)**: A contractual commitment to a customer for specific quantities of SKUs.

---

## 2. End-to-End Business Flow

### Step 1: Production Inwarding (The Entry Point)
*   **Source**: Production floor sends finished goods to the store.
*   **Logic**: Stock is recorded with a `created_at` timestamp (crucial for FIFO).
*   **State**: Stock enters the system as `Available`.
*   **Rules**: Stock must have a unique MC Number (barcode) for traceability.

### Step 2: Sales & Allocation (The Reservation)
*   **Trigger**: A Marketing Manager creates a PO.
*   **Business Logic (FIFO Allocation)**:
    *   The system searches for `Available` stock matching the PO line item (Variety, Grade, Packing).
    *   It selects the **oldest stock first** based on the inward date.
    *   The stock status changes from `Available` to `Allocated`.
*   **Impact**: Allocated stock is "invisible" to other sales orders, ensuring no double-selling of high-demand seafood.

### Step 3: Repacking (Value Addition)
*   **Trigger**: A customer requires their own branded labels on previously packed dummy stock.
*   **Logic (Inheritance & Transformation)**:
    *   **Repack Out**: Stock is moved from a Cold Store to a "Repacking Unit." The system locks the variety and grade to the linked PO's requirements.
    *   **State**: Status changes to `In Repacking`.
    *   **Repack In (The "Birth" of Branded Stock)**:
        *   Original MCs (Parents) are logically "consumed."
        *   New MCs (Children) are created with the final customer branding.
        *   **Genealogy Rule**: Every child MC must store its `parent_mc_id` to trace back to the original production date and dummy batch.
    *   **Final State**: Stock returns to `Allocated` status for the same PO, now with branded metadata.

### Step 4: Internal Logistics (Stock Balancing)
*   **Trigger**: Need to consolidate stock or move it closer to a loading facility.
*   **Workflow (Maker-Checker)**:
    1.  **Initiation (Operator)**: Proposes a transfer of specific MCs from Store A to Store B.
    2.  **State**: Status becomes `Pending Approval`.
    3.  **Approval (Manager)**: Reviews the request. Once approved, status becomes `In Transit`.
    4.  **Receipt (Receiver)**: The receiving store accepts the items. Status returns to `Available` (or remains `Allocated` if it was already reserved for a PO).

### Step 5: Shipment Planning & Execution (The Fulfillment)
*   **Trigger**: A container is scheduled for loading.
*   **Workflow**:
    1.  **Container Setup**: A Shipment record is created and linked to one or more POs.
    2.  **Loading (The Scan)**: Warehouse staff scan MCs as they enter the container.
    3.  **Verification Logic**: The system checks:
        *   Is this MC part of the system?
        *   Is it `Allocated` to the PO linked to this shipment?
        *   Has it already been scanned? (Duplicate check).
    4.  **Finalization**: Once the container is full, the shipment is marked as `Shipped`.

### Step 6: Inventory Departure
*   **State**: Status changes to `Dispatched` or is archived.
*   **Logic**: The physical inventory count in the store is reduced, and the capacity utilization for that store is updated.

---

## 3. Key Business Rules & Logic

### A. Freshness Control (Aging Logic)
Seafood is a perishable commodity. The system enforces quality control through time-based logic:
*   **Warning Threshold (14 Days)**: Stock is flagged for priority dispatch.
*   **Critical Threshold (30 Days)**: Stock is highlighted as a potential quality risk.

### B. Capacity Utilization Logic
*   Every store has a `capacity_tons` limit.
*   When stock is added, the system calculates the weight (Quantity * Weight per Packing) and updates the store's "Fill %".
*   **Business Rule**: Managers use this to decide whether to rent external cold storage or move stock to internal units.

### C. Logistics Efficiency (FCL Mapping)
*   Business is conducted in **Full Container Loads (FCL)**.
*   The system knows exactly how many MCs of a specific Variety/Packing fit into a 40ft High Cube container.
*   **Business Logic**: If a manager sees "0.8 FCL" of a product, they know they need a small production run to complete a full container for export.

### D. Multi-Store Security (Isolation)
*   Operators and Managers only see stock and movements for their **Assigned Stores**.
*   **Business Purpose**: Prevents warehouse staff in one unit from accidentally (or intentionally) altering records for another unit, ensuring localized accountability.

---
*Documented by Antigravity AI.*
