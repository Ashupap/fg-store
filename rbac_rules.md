# FGStore - Role-Based Access Control (RBAC) Details

The FGStore system implements a strict multi-tiered RBAC model to ensure operational security, data integrity, and accountability across the seafood supply chain.

---

## 1. User Roles Overview

| Role | Primary Responsibility | Access Scope |
| :--- | :--- | :--- |
| **Admin** | System Governance | Universal |
| **General Manager** | Operational Oversight | Universal (Except Security/Config) |
| **Marketing Manager**| Order Fulfillment | Sales & Inventory Only |
| **Manager** | Warehouse Operations | Assigned Stores Only |
| **Operator** | Task Execution | Assigned Stores Only |

---

## 2. Detailed Role Permissions

### 🔐 Admin (The Superuser)
*   **System Configuration**: Full control over global settings (Barcode Scanning, Shipment Modules).
*   **User Management**: Can Create, Update, and Delete users; Assign roles and physical store access.
*   **Master Data**: Full CRUD rights for Varieties, Grades, Packings, and Product Types.
*   **Store Management**: Can define new Cold Stores and set capacities.
*   **Visibility**: Universal visibility across all units and all financial/order data.

### 📈 General Manager (The Operational Head)
*   **Master Data**: Full rights to update product grades and varieties.
*   **Store Management**: Can update store details.
*   **Logistics**: Full access to Shipment Planning and PO Allocation.
*   **Approval Authority**: Can approve any pending inter-store transfers.
*   **Restriction**: Cannot access the "Users" tab or "System Configuration" in the Admin panel.

### 🛍️ Marketing Manager (The Sales Expert)
*   **PO Management**: Primary owner of the Purchase Order lifecycle (Creation to Fulfillment).
*   **Allocation**: Can reserve stock for specific customers.
*   **Dashboard**: Full visibility into live stock positions across all stores to facilitate accurate sales promises.
*   **Restriction**: **Zero access** to the Stock Movement module. Cannot record receipts, transfers, or physical dispatches.

### 🏢 Manager (The Warehouse In-Charge)
*   **Assigned Visibility**: Can only see dashboard stats and stock levels for stores specifically assigned to them.
*   **Approval Rights**: Authorized to **Approve or Reject** stock transfer requests initiated by operators within their assigned stores.
*   **Stock Integrity**: Responsible for finalizing "Acceptance" of incoming transfers.
*   **Restriction**: Cannot modify Master Data, manage users, or see stock in unassigned stores.

### 🚜 Operator (The Execution Team)
*   **Data Entry**: Responsible for recording **Inward Stock** (Receipts) from production.
*   **Initiation**: Can initiate **Transfer Requests** to move stock to other units.
*   **Actionable Only**: Limited to the execution of movements for assigned stores.
*   **Restriction**: **No Approval Rights**. Any transfer initiated by an operator remains in "Pending" status until a Manager or Admin approves it. No access to POs or Shipments.

---

## 3. The "Assigned Store" Security Layer

Beyond role-based permissions, the system enforces a **Physical Security Layer**:
*   Operators and Managers are mapped to specific `store_id`s in the `user_stores` table.
*   The system filters all API requests (`/api/stock`, `/api/movement`) based on this mapping.
*   Even if an Operator knows the URL for "Store B", if they are only assigned to "Store A", the system will return an "Unauthorized" error or empty data.

---
*Documented by Antigravity AI.*
