# Implementation Plan - FGStore Upgrades (Gemini & WhatsApp Focus)

This plan outlines the steps to implement the brainstormed improvements, focusing on cost-effectiveness using Gemini 1.5 Flash and WhatsApp.

## 1. External API & AI Integrations

### Phase 1: WhatsApp Communication (Ecolution API)
*   **Goal**: Automate real-time notifications via WhatsApp.
*   **Tasks**:
    *   [NEW] `src/lib/external/whatsapp.ts`: Create a client for the **Ecolution WhatsApp API**.
    *   Implement high-priority alerts: "Transfer Approval Needed" and "Daily Aging Stock Report".
    *   Implement "Shipment Dispatched" notifications for customers.

### Phase 2: Gemini AI Integration (Flash 1.5)
*   **Goal**: Implement cost-effective AI features for inventory intelligence.
*   **Tasks**:
    *   [NEW] `src/lib/external/gemini.ts`: Create a client for the **Gemini API** (using Flash 1.5).
    *   **AI Inventory Assistant**: Develop the prompt engineering logic to convert natural language (from WhatsApp) into SQL queries or data summaries.
    *   **Multimodal OCR**: Implement a route to handle production log images and extract data using Gemini's vision capabilities.

### Phase 3: REST API for External Apps
*   **Goal**: Enable third-party integration.
*   **Tasks**:
    *   Configure `src/app/api/external/*` routes with **API Key** authentication.
    *   Implement core endpoints: `GET /inventory`, `POST /po/create`, `GET /shipments`.
    *   Setup Swagger/OpenAPI for documentation.

## 2. Robustness Enhancements

### Phase 4: Transactional Integrity & Audit Logs
*   **Goal**: Ensure data consistency and traceability.
*   **Tasks**:
    *   Modify `src/lib/db.ts` to provide a helper for running transactions.
    *   [NEW] `src/lib/audit.ts`: Create an audit logging service.
    *   Update all critical API routes (Stock Movement, PO Allocation) to use transactions and log actions.

### Phase 5: Zod Validation Refactoring
*   **Goal**: Strict server-side validation.
*   **Tasks**:
    *   Centralize schemas in `src/lib/validations.ts`.
    *   Update all API routes to use `.parse()` on incoming payloads.

## Stage 7: Sequential Code PDF Printout Option

### Goal
Provide operators with a high-visibility physical/screen guide for writing sequential carton codes on boxes. Include layout options (Grid view vs. Large Label view) for the print page. Hook up the print actions directly on successful inward/repacking submissions (in the toast notifications) and in the transaction history table.

### Proposed Changes

#### [MODIFY] [page.tsx](file:///home/ubuntu/FGStore/fg-store/src/app/stock-movement/page.tsx)
- Define a `handlePrintCodes(id: string)` handler that opens `/stock-movement/print-codes/[id]` in a new tab.
- Update `toast` state definition to allow an optional `action` object: `{ label: string; onClick: () => void }`.
- Render the `action` button inside the toast component if present, using styling aligned with the toast theme. Set a longer timeout (15s instead of 5s) for actionable toasts.
- In `handleSubmit`, if the transaction succeeds and returns `shortCodes`, attach the `Print Codes` action to the success toast.
- In `handleApprove`, if the approved transaction is `INWARD` or `REPACK_IN` and returns `shortCodes`, show the success toast with the `Print Codes` action.
- In the transaction history table, render a second action button next to "Print Receipt" using the `ScanBarcode` icon. This button is visible for `INWARD` and `REPACK_IN` movements with `Completed` status, and triggers `handlePrintCodes`.

#### [MODIFY] [page.tsx](file:///home/ubuntu/FGStore/fg-store/src/app/stock-movement/print-codes/%5Bid%5D/page.tsx)
- Introduce layout configuration state (`layout` as `'grid' | 'large'`).
- Update non-print toolbar with layout selectors: **Grid Checklist** and **Large Carton Labels**.
- Implement custom CSS print media adjustments:
  - For Grid View: standard A4 margins, grid elements break-inside-avoid.
  - For Large Label View: hide headers/summary print details, and apply a page break after each card (`break-after: page;`) so each label prints on a separate page.
- Render massive, bold 3-character/4-character sequence codes centered on the card when Large Label view is active, enabling clear sight/placement.

## User Review Required

> [!IMPORTANT]
> Since we are using Gemini Flash, we can handle image-based OCR very effectively. Should we prioritize the **Production Log OCR** feature to reduce manual data entry work for operators?

## Verification & Testing Plan

For every stage, we will execute both **Unit Tests** (backend logic) and **User Acceptance Testing (UAT)** (simulating operator/manager actions in a virtual browser).

### Stage 1: Compilation & Tests
- **Unit**: Verify that `npm run build` compiles with zero errors, and run `npx tsx src/scripts/run-comprehensive-tests.ts` to ensure FIFO transfer logic passes completely.
- **UAT**: Validate that the live stock dashboard Excel export downloads a readable file without server crashes.

### Stage 2: Permissions & Custom RBAC
- **Unit**: Create a test role in the DB. Test that `hasPermission` correctly resolves capabilities. Verify that restricted API calls return `403` status.
- **UAT**: Sign in as a user assigned to a custom role with only `inward:create` permission. Confirm that "Transfer", "Dispatch", and "Admin Settings" pages are hidden from the UI, and attempting to post a transfer request via raw API returns "Unauthorized".

### Stage 3: Bulk Imports
- **Unit**: Feed mock sheets (valid and invalid data) to `/api/admin/import/master` and verify proper transactional database state. Ensure invalid sheets rollback and return details of failing rows.
- **UAT**: Upload a sample template containing 10 stock items, verify that the stock items are created, correct capacities are reflected in the stores, and they can immediately be selected for transfers.

### Stage 4: Reporting
- **Unit**: Run a repacking cycle, and check that the Yield Report calculations correctly reflect input vs. output weights.
- **UAT**: Click "Print Pass" on a completed transfer, and verify that the print layout is correctly formatted and hides navigation header items.

### Stage 5: Audited Transaction updates
- **Unit**: Attempt an unauthorized update (no reason provided, or quantity reduced below allocated levels). Confirm the transaction rolls back, data is unchanged, and error is raised. Run a successful update and check that `audit_logs` records old and new state snapshots correctly.
- **UAT**: Log in as a manager, edit a transaction, provide a reason, verify that the update is saved, and check that the edit is shown on the admin audit logs table.

### Stage 6: Traceability & Manual MC Selection
- **Unit**: Verify that `handleInward` and `handleRepackIn` correctly insert `barcode` matching the carton's `mcNumber` when barcodes are omitted. Check `/api/stock?list=true&store=...` and verify it returns individual carton items in chronological FIFO order.
- **UAT**: Navigate to Stock Movements page, turn off barcode scanning in Admin settings. Verify that inter-store Transfer and Dispatch forms show a "Manual MC Selection Mode" toggle. Turn it on, verify that a checklist of available cartons in the selected store is displayed, and check/uncheck specific items. Submit the request and verify it succeeds and moves those specific cartons.

### Stage 7: Sequential Code PDF Printout
- **Unit**: Verify `print-codes/[id]` API response and check that NextJS build compiles successfully.
- **UAT**: Create an inward movement or approve one. Click "Print Codes" from the success toast. Verify that it opens `/stock-movement/print-codes/[id]`. Toggle between "Grid Checklist" and "Large Carton Labels" layouts. Verify that clicking "Print marking guide" triggers the browser print dialog. In the print dialog, verify that the large labels layout is formatted with page breaks between each label. Verify that the transaction history table shows a "Print Carton Codes" icon button for inward transactions.

### Additional Verification
*   Sending a WhatsApp message to query stock and verifying the Gemini response.
*   Uploading a sample production log image and verifying correct data extraction.
