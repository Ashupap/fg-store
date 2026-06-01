# FGStore (Marine Flow) - User Workflow Report

This report provides a detailed examination of every user workflow within the FGStore repository, a finished goods management system tailored for the seafood industry.

## 1. Authentication & Security
The system implements a secure entry point with strict Role-Based Access Control (RBAC).

*   **Login Workflow**: Users authenticate via username/email and password. JWT tokens are used for session management.
*   **Role-Based Permissions**:
    *   **Admin**: Full system access, including configuration and user management.
    *   **General Manager**: Full visibility and master data control, but restricted from system configuration.
    *   **Marketing Manager**: Focused on PO allocation and dashboard analytics; no stock movement rights.
    *   **Manager**: Localized control. Can approve movements and manage stock for assigned stores.
    *   **Operator**: Task-oriented. Can initiate inward and transfer requests for assigned stores.
*   **Store Assignment**: Users (Operators/Managers) are restricted to operations within cold stores specifically assigned to them by an Admin.

## 2. Dashboard & Analytics
The Dashboard serves as the central hub for operational visibility.

*   **Live Stock Position**:
    *   Real-time view of inventory grouped by Variety, Grade, and Packing.
    *   Dynamic filtering by Stock Type (IQF/SLAB), Variety, and Grade.
    *   Detailed store-level breakdown of stock when expanding a row.
*   **Logistics Intelligence**:
    *   **FCL Calculation**: Automatically calculates the number of 40ft Full Container Loads (FCL) available based on current stock.
    *   **Aging Analysis**: Visual badges (Warning/Destructive) highlight stock aging beyond 14 or 30 days.
*   **Capacity Monitoring**: Visual widget showing percentage utilization of each Cold Store based on weight capacity.
*   **Data Export**: Ability to export the live stock position to Excel for offline reporting.

## 3. Stock Management Workflow
The core of the system is managing the lifecycle of Master Cartons (MCs).

*   **Inward Movement (Production Entry)**:
    *   Recording new stock arriving from production.
    *   Supports manual entry or **Barcode Scanning** of MC numbers.
*   **Internal Transfer (Inter-Store)**:
    *   **Initiation**: User selects "From Store", "To Store", and the items to move.
    *   **Approval**: A Manager must approve the request (moves to "In Transit").
    *   **Acceptance**: The receiving store must "Accept" the transfer to finalize the stock movement.
*   **Dispatch Workflow**:
    *   Shipping stock to customers or for repacking.
    *   Linked to specific Purchase Orders (POs) to ensure correct fulfillment.
*   **Audit & History**:
    *   Every movement is logged with a unique Movement ID, timestamp, user, and locations.
    *   Filterable history log for tracing past transactions.
    *   **Receipt Printing**: Generating professional transaction receipts for Inward, Transfer, and Dispatch actions.

## 4. Purchase Order (PO) & Allocation
Managing customer orders and ensuring stock is reserved correctly.

*   **PO Creation**: Defining customer orders with multiple line items (Type, Variety, Grade, Packing, Quantity).
*   **Automated Allocation (FIFO)**: The system auto-allocates stock to POs based on the "First-In-First-Out" principle (oldest stock first).
*   **Fulfillment Tracking**: Real-time monitoring of "Ordered" vs. "Allocated" vs. "Pending" quantities per line item.
*   **Stock Reservation**: Allocated stock is "Reserved" and cannot be dispatched for other orders.
*   **Manual Deallocation**: Releasing reserved stock from a PO if order requirements change.

## 5. Shipment & Container Planning
An advanced workflow for coordinating large-scale shipments.

*   **Shipment Creation**: Linking a new shipment (container) to a fully allocated PO.
*   **Container Loading (Scanning Workflow)**:
    *   A high-speed, mobile-optimized scanning interface for warehouse staff.
    *   **Real-time Verification**: Every MC scanned is instantly verified against the PO's allocated list.
    *   **Instant Feedback**: Large visual/audio-style cues for Success, Duplicate, or Invalid scans.
    *   **Progress Tracking**: Circular progress bar showing real-time loading status (e.g., 400/1200 MCs loaded).
*   **Manifest Completion**: Once loading is finished, the shipment is marked as "Shipped," finalizing the stock removal.

## 6. System Administration
Tools for managing the system's foundational data.

*   **User Management**: Creating/editing users, setting roles, and managing store access permissions.
*   **Master Data Configuration**:
    *   **Varieties**: Defining products and their respective MCs-per-FCL conversion factors.
    *   **Grades & Packings**: Standardizing quality and packaging types used throughout the system.
*   **Store Management**: Defining Cold Stores, their types (Rented/Internal), and physical capacities.
*   **System Settings**:
    *   Toggling **Barcode Scanning** functionality.
    *   Enabling/Disabling the **Container Planning** module.

## 7. Repacking Workflow
A specialized value-addition workflow for transforming bulk/dummy stock into customer-branded retail packets.

*   **PO-Centric Repack Out**:
    *   Initiated for existing **Allocated** stock only.
    *   Users select a Purchase Order and Line Item; the system auto-fetches the reserved MCs.
    *   Stock is moved to the "Production (Repacking)" unit, inheriting all PO metadata.
*   **Repack In (Branded Transformation)**:
    *   Converts dummy MCs into **Child MCs** with new branded packing labels.
    *   **Genealogy Tracking**: Maintains a persistent link (`parent_mc_id`) to the original dummy batch for 100% traceability.
    *   **Auto-Reallocation**: Newly created branded MCs are automatically reserved back to the original PO, ensuring the order remains fulfilled.

---
*Report generated by Antigravity AI Coding Assistant.*
