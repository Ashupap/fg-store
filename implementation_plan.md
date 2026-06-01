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

## User Review Required

> [!IMPORTANT]
> Since we are using Gemini Flash, we can handle image-based OCR very effectively. Should we prioritize the **Production Log OCR** feature to reduce manual data entry work for operators?

## Verification Plan

### Automated Tests
*   Unit tests for the new `src/lib/external` clients.
*   Integration tests for transactions and audit logging.

### Manual Verification
*   Sending a WhatsApp message to query stock and verifying the Gemini response.
*   Uploading a sample production log image and verifying correct data extraction.
