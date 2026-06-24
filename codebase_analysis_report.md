# FGStore — Complete Codebase Analysis Report

> **Generated:** June 24, 2026
> **Scope:** Full codebase audit of D:\New\FGStore\fg-store

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Component Hierarchy](#6-component-hierarchy)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Business Logic Flows](#8-business-logic-flows)
9. [Critical Issues Found](#9-critical-issues-found)
10. [Code Quality Analysis](#10-code-quality-analysis)
11. [Security Audit](#11-security-audit)
12. [Performance Assessment](#12-performance-assessment)
13. [Testing Coverage](#13-testing-coverage)
14. [Deployment Review](#14-deployment-review)
15. [Improvement Suggestions](#15-improvement-suggestions)
16. [File-Level Hotspots](#16-file-level-hotspots)

---

## 1. Architecture Overview

**Application Type:** Inventory Management ERP for Seafood Cold Store Industry
**Architecture Pattern:** Next.js 16 App Router (Full-stack Monolith)
**Database:** SQLite via better-sqlite3 (single-file, WAL mode)
**Auth:** JWT (HTTP-only cookie, 7-day expiry)
**Deployment:** Docker (multi-stage) + Docker Compose + Nginx reverse proxy

### Domain Model

The system manages **Master Cartons (MCs)** through their complete lifecycle:

```
Production → Inward (Available)
  → Transfer (In Transit → Available at destination)
  → Repack Out (In Repacking)
    → Repack In (Allocated, with parent_mc_id genealogy)
  → PO Allocation (Reserved / Allocated)
    → Dispatch (Dispatched, linked to Shipment)
```

### Key Architectural Decisions

| Decision | Rationale | Trade-off |
|---|---|---|
| SQLite instead of PostgreSQL | Zero ops overhead, single-file backup | Write lock contention at high concurrency |
| Singleton DB connection | Simple, no connection pool overhead | No connection pooling, hard to test |
| Schema-as-code in db.ts | No migration tool needed | Schema changes require app redeploy |
| Raw fetch instead of React Query | Simpler initial build | No caching, stale-while-revalidate, deduplication |
| Maker-Checker pattern | Two-person rule for inventory integrity | Extra UI complexity for pending states |

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose | Usage Quality |
|---|---|---|---|
| Next.js | 16.0.8 | React framework (App Router) | ✅ Good |
| React | 19.2.1 | UI library | ✅ Good |
| Tailwind CSS | v4 | Utility CSS | ✅ Good |
| Framer Motion | 12.23.26 | Animations | ⚠️ Only landing page |
| Lucide React | 0.560.0 | Icons | ✅ Good |
| TanStack React Query | 5.90.12 | Server state | ❌ Not used (in deps but 0 imports) |
| Zod | 4.1.13 | Schema validation | ✅ Good (server-side only) |
| Radix UI | ^2.1.16 | Dropdown primitive | ⚠️ Underutilized |
| date-fns | 4.1.0 | Date formatting | ✅ Good |
| xlsx | 0.18.5 | Excel export | ✅ Good |
| next-themes | 0.4.6 | Theme | ⚠️ Light mode forced |

### Backend

| Technology | Version | Purpose | Usage Quality |
|---|---|---|---|
| Next.js API Routes | 16.0.8 | REST API | ✅ Good structure |
| better-sqlite3 | 12.5.0 | SQLite driver | ✅ Good (synchronous, fast) |
| bcryptjs | ^3.0.3 | Password hashing | ✅ Good |
| jsonwebtoken | ^9.0.3 | JWT auth | ✅ Good |
| Zod | 4.1.13 | Input validation | ✅ Good (all endpoints) |

### Dev/Build

| Technology | Version | Purpose |
|---|---|---|
| TypeScript | ^5 | Type checking |
| tsx | 4.21.0 | TS script runner |
| ESLint | ^9 | Linting (Next.js config) |
| Turbopack | — | Dev bundler |
| Babel React Compiler | 1.0.0 | React optimization |

---

## 3. Directory Structure

```
fg-store/
├── .dockerignore
├── .env.example
├── .gitignore
├── brainstorming_improvements.md
├── build_log.txt
├── business_logic_flow.md
├── data/                          # SQLite DB persistence
│   ├── fg-store.db
│   ├── fg-store.db-shm
│   └── fg-store.db-wal
├── deploy.sh
├── DEPLOYMENT.md
├── docker-compose.yml
├── Dockerfile
├── eslint.config.mjs
├── fg_store.db                    # Root-level duplicate
├── implementation_plan.md
├── list-user.sh
├── list-users.sh
├── manual-seed-admin.sh
├── Marine_Flow_Pitch_Document.docx
├── next.config.ts
├── nginx.conf.example
├── package.json
├── postcss.config.mjs
├── public/
│   ├── guide/ (10 PNG screenshots)
│   └── static assets
├── rbac_rules.md
├── README.md
├── repacking_implementation_plan.md
├── scratch/generate_pitch_docx.py
├── simulation_output.txt
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (app)/                 # Authenticated layout group
│   │   │   ├── admin/
│   │   │   │   ├── import/page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── guide/page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── po-allocation/page.tsx
│   │   │   ├── shipments/
│   │   │   │   ├── [id]/load/page.tsx
│   │   │   │   └── page.tsx
│   │   │   └── stock-movement/
│   │   │       ├── page.tsx
│   │   │       ├── print-codes/[id]/page.tsx
│   │   │       ├── print-master-report/[id]/page.tsx
│   │   │       └── receipt/[id]/page.tsx
│   │   ├── api/                   # 30+ route handlers
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── master-data/
│   │   │   ├── movement/
│   │   │   ├── po/
│   │   │   ├── reports/
│   │   │   ├── shipment/
│   │   │   └── stock/
│   │   ├── error.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── dashboard/CapacityWidget.tsx
│   │   ├── layout/AppShell.tsx, Sidebar.tsx, TopBar.tsx
│   │   ├── mode-toggle.tsx
│   │   ├── theme-provider.tsx
│   │   └── ui/ (button, card, input, select, table, badge, switch, dropdown-menu, progress, aceternity/)
│   ├── lib/
│   │   ├── allocation.ts          # PO auto-allocation engine
│   │   ├── auth.ts                # JWT, bcrypt, permissions
│   │   ├── db.ts                  # Singleton SQLite + schema
│   │   ├── excel.ts               # SpreadsheetML export
│   │   ├── stock-logic.ts         # Core movement logic (969 lines)
│   │   ├── utils.ts               # Helpers
│   │   └── validations.ts         # Zod schemas
│   ├── middleware.ts               # Edge auth guard
│   ├── scripts/                    # 50+ ad-hoc TS scripts
│   └── types/index.ts
├── tsconfig.json
├── typescript_errors.log
└── tsc_output.txt
```

---

## 4. Database Schema

**Engine:** SQLite (WAL journal mode, foreign_keys ON)
**Tables:** 15

### Table: `users`
```sql
id INTEGER PK, username TEXT UNIQUE, email TEXT UNIQUE NOT NULL,
password_hash TEXT NOT NULL, name TEXT NOT NULL,
role TEXT DEFAULT 'operator', is_active INTEGER DEFAULT 1,
created_at/updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

### Table: `fg_stock_master` (Core Inventory — ~10K+ rows expected)
```sql
id INTEGER PK, mc_number TEXT UNIQUE NOT NULL,
batch_id TEXT, product_code TEXT,
grade TEXT NOT NULL, variety TEXT, type TEXT,
packing_code TEXT NOT NULL, packing_date TEXT NOT NULL,
cold_store TEXT NOT NULL, status TEXT DEFAULT 'Available',
reserved_for_po TEXT, reserved_line_item TEXT, allocated_to_fcl TEXT,
created_by_id INTEGER, barcode TEXT UNIQUE, parent_mc_id INTEGER,
is_repacked INTEGER DEFAULT 0, short_code TEXT UNIQUE, section_id INTEGER,
created_at/updated_at TEXT DEFAULT CURRENT_TIMESTAMP
-- Indexes: grade, packing_code, cold_store, status, parent_mc_id, section_id, barcode, short_code
```

### Table: `stock_movement_log` (Audit Trail — high volume)
```sql
id INTEGER PK, movement_id TEXT UNIQUE NOT NULL,
movement_datetime TEXT NOT NULL,
action_type TEXT NOT NULL (INWARD|TRANSFER|DISPATCH|REPACK_OUT|REPACK_IN),
from_location TEXT, to_location TEXT,
type/variety/packing/grade TEXT, mc_numbers TEXT,
qty_mcs INTEGER NOT NULL, moved_by_id INTEGER, approved_by_id INTEGER,
remarks TEXT, dispatch_purpose TEXT, po_id INTEGER,
status TEXT DEFAULT 'Completed', allocation_strategy TEXT DEFAULT 'FIFO'
-- Indexes: action_type, movement_datetime
```

### Table: `purchase_orders`
```sql
id INTEGER PK, po_number TEXT UNIQUE NOT NULL,
customer TEXT, order_date TEXT,
branding_type TEXT DEFAULT 'Demo', loading_store TEXT,
status TEXT DEFAULT 'Active', created_at TEXT
```

### Table: `po_line_items`
```sql
id INTEGER PK, po_id INTEGER NOT NULL (FK),
type/variety/grade/packing_code TEXT NOT NULL,
ordered_qty INTEGER NOT NULL, allocated_qty INTEGER DEFAULT 0
```

### Other Tables: `master_data`, `stores`, `user_stores`, `settings`, `roles`, `audit_logs`, `store_sections`, `carton_sequence`, `po_customer_barcodes`, `system_settings`

---

## 5. API Endpoints

### Authentication (3 routes)
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, sets `auth-token` cookie |
| POST | `/api/auth/logout` | Clears cookie |
| GET | `/api/auth/me` | Current user + permissions + stores |

### Dashboard (4 routes)
| Method | Route | Description |
|---|---|---|
| GET | `/api/dashboard` | Aggregated stock with filters |
| GET | `/api/dashboard/capacity` | Store capacity utilization |
| GET | `/api/dashboard/export` | Excel download |
| GET | `/api/dashboard/filter-options` | Dynamic dropdown values |

### Stock (5 routes)
| Method | Route | Description |
|---|---|---|
| GET | `/api/stock` | Summary or list view |
| GET | `/api/stock/locate` | Positions by section |
| GET | `/api/stock/filters` | Dynamic stock filters |
| GET | `/api/stock/allocated` | PO-allocated stock |
| GET | `/api/stock/batches-by-date` | Batches grouped by date |

### Movement (9 routes) — Core workflow
| Method | Route | Description |
|---|---|---|
| POST | `/api/movement` | Create (or auto-execute for admin) |
| GET | `/api/movement` | History with filters/pagination |
| GET | `/api/movement/pending` | Pending approvals |
| PUT | `/api/movement/[id]` | Update pending request |
| GET | `/api/movement/[id]` | Single movement detail |
| POST | `/api/movement/[id]/approve` | Approve → execute |
| POST | `/api/movement/[id]/reject` | Reject request |
| POST | `/api/movement/[id]/cancel` | Cancel/callback transfer |
| POST | `/api/movement/[id]/accept` | Accept inbound transfer |
| PUT | `/api/movement/[id]/update` | Update completed (audited) |
| POST | `/api/movement/import` | Bulk import from Excel |

### Purchase Orders (8 routes)
| Method | Route | Description |
|---|---|---|
| GET/POST | `/api/po` | List/create POs |
| GET | `/api/po/active` | Active POs for dropdowns |
| GET | `/api/po/items` | Line items by PO |
| GET | `/api/po/[id]` | Single PO details |
| GET | `/api/po/[id]/stock` | Reserved stock |
| POST | `/api/po/[id]/allocate` | Manual allocation |
| POST | `/api/po/[id]/deallocate` | Release allocation |
| POST | `/api/po/[id]/barcodes` | Customer barcode upload |

### Admin (11 routes)
CRUD for users, stores, sections, roles, settings, audit logs, master data import.

### Shipments (4 routes)
List, create, edit, verify (scan barcode during container loading).

### Reports (3 routes)
Ledger report, store-movement summary, yield report.

---

## 6. Component Hierarchy

```
RootLayout
├── LandingPage (public)
├── LoginPage
└── AppLayout (auth check)
    └── AppShell
        ├── Sidebar (role-filtered, setting-gated nav)
        ├── TopBar (breadcrumbs, user badge, mobile menu)
        └── Main Content
            ├── DashboardPage
            │   ├── CapacityWidget
            │   ├── Stats Cards (4)
            │   ├── Filter Panel
            │   ├── Data Table (expandable rows)
            │   └── WarehouseGridMap (section-level view)
            │       ├── SKUSummaryView
            │       └── CartonChecklistView
            ├── StockMovementPage (~2,000 lines)
            │   ├── Action Hub (5 cards)
            │   ├── Pending Approvals Section
            │   ├── History Table + Filters
            │   └── Multi-step Wizard Modal (dynamic)
            ├── POAllocationPage
            ├── AdminPage (10-tab interface)
            ├── ShipmentsPage
            ├── LoadingPage (barcode scanner)
            ├── ReceiptPage / PrintCodesPage / PrintMasterReportPage
            └── GuidePage
```

---

## 7. Authentication & Authorization

### Auth Flow
1. User submits credentials → `POST /api/auth/login`
2. Server validates with Zod, hashes/compares password with bcryptjs
3. JWT generated with `{userId, email, username, name, role}`, 7-day expiry
4. Set as `auth-token` cookie: `httpOnly`, `sameSite: lax`, `secure: false`
5. Edge middleware checks cookie on every protected route
6. Server components call `getCurrentUser()` server-side
7. Client components call `GET /api/auth/me` on mount

### RBAC Model — 5 Roles
| Role | Scope | Key Permissions |
|---|---|---|
| `admin` | Global | `*` (wildcard) |
| `general_manager` | Global (excl. security) | `master:manage`, `transfer:approve`, `po:manage`, `po:allocate`, `shipment:manage`, `reports:view`, `transaction:update` |
| `marketing_manager` | Sales only | `po:manage`, `po:allocate`, `reports:view` |
| `manager` | Assigned stores | `transfer:approve`, `transfer:accept`, `reports:view` |
| `operator` | Assigned stores | `inward:create`, `transfer:initiate` |

### Store Isolation
- Enforced at API route level
- Operators/managers see only assigned stores via `user_stores` join table
- Admin/GM see all stores

---

## 8. Business Logic Flows

### Inward (Production → Store)
1. Validate input (Zod)
2. Generate MC numbers via sequence prefix (MC-{grade}-{packing}-{XXXX})
3. Generate short codes (Base32, collision-avoidant)
4. Allocate to sections (best-fit algorithm if location mapping enabled)
5. Insert stock records as `Available`
6. Insert movement log as `Completed`
7. Trigger global PO auto-allocation

### Transfer (Store → Store)
1. Validate input (Zod)
2. Check `fromStore !== toStore`
3. Fetch available cartons matching SKU filters
4. Exclude cartons already in pending transfers (double-booking prevention)
5. Sort by FIFO or LIFO strategy
6. Update stock `cold_store = 'In Transit'`
7. Create movement log with status `In Transit`

### Transfer Accept (Receiver confirms receipt)
1. Update stock `cold_store = toStore`
2. Update movement status to `Completed`

### Dispatch (Store → Customer)
1. Require linked PO
2. Fetch stock reserved/allocated to PO (differentiated by branding type: Demo=Reserved, Branded=Allocated)
3. Multi-identifier matching: MC number, short code, customer barcode
4. Update stock status → `Dispatched`, `cold_store = 'Dispatch'`
5. Mark PO as `Dispatched`

### Repack Out (Store → Production for repacking)
1. Validate MCs provided by operator
2. Verify MCs are in store and not in pending transfers
3. Check PO compatibility (Demo POs cannot be repacked)
4. Update stock status → `In Repacking`, `cold_store = 'Production'`

### Repack In (Production → Store, new branded MCs)
1. Verify parent MCs are `In Repacking` / `Production`
2. Insert new child MCs with inherited metadata (variety, grade, PO allocation)
3. Link via `parent_mc_id` (genealogy)
4. Assign customer barcodes if enabled and PO is Branded
5. Mark parent MCs as `Repacked`
6. New status: `Allocated` if PO-linked, else `Available`

### PO Auto-Allocation
1. Triggered after any inward movement
2. Fetches pending PO line items (allocated_qty < ordered_qty), ordered by PO creation date (oldest first)
3. For each line item: finds Available stock matching type/variety/grade/packing, FIFO sorted
4. Updates stock status → `Reserved` (Demo) with `reserved_for_po` FK
5. Updates line item `allocated_qty`
6. Marks PO `Fulfilled` if all items satisfied

### Shipment Verification (Container Loading)
1. Operator scans MC barcode during container loading
2. System validates: MC exists, is allocated to linked PO, not already scanned
3. Visual feedback: success (green), already scanned (yellow), invalid (red)
4. Progress indicator toward container target

---

## 9. Critical Issues Found

### 🔴 Issue 1: No Automated Testing Framework
- **Location:** `package.json`, `src/scripts/`
- **Severity:** Critical
- **Detail:** 50+ ad-hoc TypeScript scripts in `src/scripts/` serve as testing. No Jest, Vitest, Playwright, or Cypress. No CI pipeline. No automated regression. Every change risks breaking existing flows.
- **Evidence:** `package.json` has no test script; `src/scripts/run-comprehensive-tests.ts` is a manual integration runner.

### 🔴 Issue 2: Excessive `as any` Casts
- **Location:** Throughout `src/lib/`, `src/app/api/`
- **Severity:** High
- **Detail:** 130+ `as any` type assertions, primarily on database query results. This bypasses TypeScript's type safety entirely and will mask runtime errors.
- **Evidence:** `stock-logic.ts:55` — `db.prepare(...).get() as { value: string } | undefined` pattern repeated everywhere; `auth.ts:26` — explicit comment: `// Cast to any to bypass type check for now`

### 🔴 Issue 3: Hardcoded JWT Secret
- **Location:** `src/lib/auth.ts:7`
- **Severity:** Critical (Security)
- **Detail:** `const JWT_SECRET = process.env.JWT_SECRET || 'fg-store-secret-key-change-in-production'` — a fallback string is commit to source code. If `.env` is missing in production, the default secret is used.
- **Fix:** Throw if `JWT_SECRET` is not set in production.

### 🔴 Issue 4: Duplicate Type Definitions
- **Location:** `src/types/index.ts:29-41` and `:196-207`
- **Severity:** Medium
- **Detail:** `LoginCredentials` and `AuthToken` interfaces defined twice in the same file. `LoginCredentials` first uses `username`, second uses `email`. This will cause confusion and potential build issues.
- **Evidence:** Lines 29-41 vs lines 196-207.

### 🔴 Issue 5: TanStack React Query Not Used
- **Location:** `package.json` (dependency), but zero imports
- **Severity:** High
- **Detail:** `@tanstack/react-query@^5.90.12` is in dependencies but every page uses raw `fetch()` + `useEffect()` for data fetching. No caching, no deduplication, no stale-while-revalidate, no background refetching.
- **Evidence:** Search any `page.tsx` for `useQuery` or `useMutation` — none found.

### 🔴 Issue 6: Monolithic Components
- **Location:** `src/app/(app)/stock-movement/page.tsx`, `src/app/(app)/dashboard/page.tsx`
- **Severity:** High
- **Detail:** Stock movement page is ~2,000 lines handling 5 movement types (inward, transfer, dispatch, repack out, repack in) with scanning, edit mode, and multi-step wizard. Dashboard page is ~1,000 lines with inline sub-components.
- **Maintainability risk:** A single change touches one massive file.

### 🔴 Issue 7: No Error Boundaries
- **Location:** No `ErrorBoundary` components anywhere
- **Severity:** High
- **Detail:** If any API call fails mid-page, the entire UI crashes. No fallback UI. `src/app/error.tsx` exists but is the global default.
- **Evidence:** No React error boundary wrappers around any section.

### 🔴 Issue 8: Hardcoded Filter Values
- **Location:** `src/app/(app)/dashboard/page.tsx:345-346`
- **Severity:** Medium
- **Detail:** Stock type filter options `['IQF', 'SLAB']` are hardcoded instead of fetched from `master_data` table. Adding a new product type requires code change.
- **Evidence:** Lines 345-346: `<option value="IQF">IQF</option><option value="SLAB">SLAB</option>`

### 🔴 Issue 9: Mixed Date Handling
- **Location:** Throughout `db.ts` schema and `utils.ts`
- **Severity:** Medium
- **Detail:** All timestamps stored as TEXT. `formatDisplayDate` has 6 different branching paths for date parsing. Timezone handling is inconsistent between `getDate()`/`getUTCDate()` calls.
- **Risk:** Date display inconsistencies between different server timezones.

### 🔴 Issue 10: No CSRF Protection
- **Location:** Missing entirely
- **Severity:** High (Security)
- **Detail:** Cookie-based auth with `sameSite: lax` and no CSRF token. If a user is logged in and visits a malicious site, state-changing API calls can be forged.

### 🔴 Issue 11: No Rate Limiting on Login
- **Location:** `src/app/api/auth/login/route.ts`
- **Severity:** High (Security)
- **Detail:** Login endpoint has no brute-force protection. An attacker can attempt unlimited password guesses.

### 🔴 Issue 12: Auth Cookie Has `secure: false`
- **Location:** Login route
- **Severity:** Medium (Security)
- **Detail:** Cookie is sent over HTTP. Acceptable for local dev/Intranet but insecure if exposed.

### 🔴 Issue 13: Console.log in Production Code Paths
- **Location:** Throughout `stock-logic.ts`, API routes
- **Severity:** Low-Medium
- **Detail:** Multiple `console.log` calls in business logic paths (e.g., `[StockLogic] Handling Inward:`, `[Approve] Result:`). Leaks operational data in production logs.

---

## 10. Code Quality Analysis

### Strengths
- ✅ Consistent file naming (kebab-case)
- ✅ Logical folder structure matching Next.js conventions
- ✅ Zod validation on all mutation endpoints
- ✅ Parameterized SQL queries (no SQL injection)
- ✅ Imports use `@/` path alias consistently
- ✅ Loading states (spinners) on all data fetches
- ✅ Toast notifications for user feedback
- ✅ Responsive design (mobile/desktop table views)

### Weaknesses
- ❌ 130+ `as any` casts
- ❌ No TypeScript strict mode enforcement for DB results
- ❌ Mixed async/sync patterns (business logic is sync, API routes are async)
- ❌ Duplicate code in allocation.ts and stock-logic.ts (FIFO sort)
- ❌ No service layer abstraction
- ❌ No dependency injection (singleton db prevents mocking)
- ❌ Inline SQL with string concatenation for dynamic WHERE clauses (though params are parameterized)
- ❌ No consistent error response shape (sometimes `error`, sometimes `message`)

### Code Smells
1. **`src/lib/db.ts:13`** — `require('fs')` in an ES module file (should be `import`)
2. **`...data` in try-catch** — `stock-logic.ts:120` — `(error: any)` hides error types
3. **`globalThis.Map`** — `dashboard/page.tsx:566` — should be `new Map()`
4. **Magic numbers** — `BASE32_ALPHABET`, `32768`, `1048576` in stock-logic.ts
5. **TODO in committed code** — `auth.ts:19` — "Let's check types..."
6. **Duplicate DB file** — `fg_store.db` at root AND `data/fg-store.db`

---

## 11. Security Audit

| Finding | Severity | Status |
|---|---|---|
| JWT secret hardcoded fallback | 🔴 Critical | Fix immediately |
| No CSRF protection | 🔴 High | Needs implementation |
| No rate limiting on login | 🔴 High | Needs implementation |
| Auth cookie `secure: false` | 🟡 Medium | Acceptable for intranet |
| Console.log in production paths | 🟡 Medium | Needs cleanup |
| SQL injection risk | ✅ None | Parameterized queries |
| XSS via JSON responses | ✅ None | React auto-escapes |
| Weak password policy | 🟡 Medium | No password complexity enforced |
| Session invalidation on role change | 🟡 Medium | JWT has 7-day expiry, no revoke |
| No HTTPS enforcement | 🟡 Medium | Handled by Nginx in production |

---

## 12. Performance Assessment

### Database
- SQLite WAL mode allows concurrent reads but serializes writes
- No connection pooling (single connection)
- Indexes created for key columns but not all query patterns
- `stock_movement_log` text search on `mc_numbers` (comma-separated TEXT) — no full-text index

### API
- No pagination on movement history beyond `LIMIT 50` (acceptable now but will be a problem at scale)
- No server-side pagination on stock listing
- N+1 query potentially in dashboard aggregation (separate queries per SKU/store)

### Frontend
- No React Query caching (every page mount = fresh fetch)
- No data prefetching on navigation
- No list virtualization for large tables
- No code-splitting beyond Next.js automatic route splitting

### Scalability Ceiling
- **Users:** 50-100 concurrent (SQLite write contention becomes visible)
- **MCs:** 500K+ (indexes degrade, full table scans on non-indexed queries)
- **Movement history:** 100K+ rows (TEXT search on `mc_numbers` slows)
- **Concurrent writes:** ~10/sec (SQLite WAL limit)

---

## 13. Testing Coverage

| Type | Status | Details |
|---|---|---|
| Unit tests | ❌ None | No Jest/Vitest configuration |
| Integration tests | ⚠️ Ad-hoc | 50+ TS scripts in `src/scripts/` |
| E2E tests | ❌ None | No Playwright/Cypress |
| Load tests | ❌ None | No k6/artillery |
| CI pipeline | ❌ None | No GitHub Actions/CircleCI |

### Existing Test Scripts (manual only)
- `run-comprehensive-tests.ts` — Orchestrator
- `test-full-flow.ts` — End-to-end workflow
- `test-concurrency.ts` — Concurrent operations
- `test-cancel-transfer.ts` — Cancel flow
- `test-custom-roles.ts` — RBAC verification
- `test-sections.ts` — Section allocation
- `setup-test-data.ts` — Test data seeder
- Multiple `verify-*.ts` scripts

---

## 14. Deployment Review

### Docker Setup
- **Dockerfile:** Multi-stage (base → deps → builder → runner), `node:20-alpine`, creates `nextjs` user (UID 1001), volume for `data/`
- **docker-compose:** Single `app` service, port 3000, volume mount `./data:/app/data`, loads `.env`
- **nginx.conf.example:** Reverse proxy, real-ip headers, 10MB body limit

### Issues
1. No health check in docker-compose
2. No restart policy (should be `always` or `unless-stopped`)
3. No resource limits (CPU/memory)
4. No logging configuration
5. No multi-service orchestration (single container)

### Documentation
- `DEPLOYMENT.md` — Comprehensive Ubuntu/Docker/Nginx guide with SSL certbot instructions
- `deploy.sh` — Pull, rebuild, restart automation
- Backup strategy described but not automated

---

## 15. Improvement Suggestions

### P0 — Immediate (Week 1)

| # | Improvement | Effort | Impact | Details |
|---|---|---|---|---|
| 1 | Fix hardcoded JWT secret | 30 min | Critical | Throw on missing `JWT_SECRET` in production |
| 2 | Add Vitest + first test suite | 2 days | High | Start with `allocation.ts` and `stock-logic.ts` unit tests |
| 3 | Create proper DB result types | 3 days | High | Replace `as any` with generated or hand-crafted row types |
| 4 | Remove duplicate type definitions | 30 min | Medium | Dedup `LoginCredentials` and `AuthToken` |
| 5 | Add CSRF protection | 1 day | High | Double-submit cookie or SameSite=Strict |

### P1 — High Value (Week 2-3)

| # | Improvement | Effort | Impact | Details |
|---|---|---|---|---|
| 6 | Adopt TanStack React Query | 3 days | High | Replace raw `fetch` + `useEffect` everywhere |
| 7 | Split monolithic pages | 4 days | High | `StockMovementPage` → 5-6 focused components |
| 8 | Add error boundaries | 2 days | High | Wrap API sections in `<ErrorBoundary>` |
| 9 | Add pagination to list endpoints | 2 days | Medium | Server-side page/total for movement + stock |
| 10 | Add rate limiting on login | 1 day | High | In-memory or DB-backed attempt tracking |
| 11 | Fix hardcoded filter values | 2 hours | Medium | Fetch stock types from master_data |

### P2 — Medium Term (Week 4-6)

| # | Improvement | Effort | Impact | Details |
|---|---|---|---|---|
| 12 | Extract service layer | 5 days | High | `stock-logic.ts` → `StockService`, `AllocationService` |
| 13 | Database migration tool | 3 days | High | Drizzle Kit or manual migration files |
| 14 | Add health endpoint | 1 day | Medium | DB connectivity + disk + uptime |
| 15 | Add loading skeletons | 2 days | Medium | Replace spinners with skeleton UIs |
| 16 | Consistent date handling | 2 days | Medium | Use `date-fns` throughout, add timezone config |
| 17 | Replace `console.log` with logger | 1 day | Low | Pino or Winston for structured logging |

### P3 — Strategic (Week 7-12)

| # | Improvement | Effort | Impact | Details |
|---|---|---|---|---|
| 18 | PostgreSQL migration | 2-3 weeks | High | Needed for >50 concurrent users |
| 19 | Redis caching | 1 week | High | Cache master data, dashboard aggregations |
| 20 | PWA + offline scan | 2 weeks | High | Service worker + IndexedDB queue |
| 21 | WebSocket realtime updates | 1 week | Medium | SSE for live dashboard |
| 22 | API documentation | 3 days | Medium | OpenAPI via Scalar or Next Swagger Doc |
| 23 | WhatsApp notifications | 1-2 weeks | Medium | Ecolution API for aging alerts, approvals |
| 24 | CI/CD pipeline | 2 days | High | GitHub Actions: lint → typecheck → test → build |

### P4 — Long Term (Quarter 2+)

| # | Improvement | Effort | Impact |
|---|---|---|---|
| 25 | PostgreSQL migration | 2-3 weeks | Enterprise scalability |
| 26 | Gemini AI assistant | 2-3 weeks | Natural language queries, OCR |
| 27 | REST API + API keys | 2 weeks | 3rd party integration |
| 28 | Accounting integration | 1-2 weeks | QuickBooks/Xero sync |
| 29 | IoT temperature integration | 2-3 weeks | Sensitech/Testo API |
| 30 | Container tracking | 1-2 weeks | Maersk/MSC/Project44 |
| 31 | Inventory reconciliation | 1 week | Physical audit workflow |

---

## 16. File-Level Hotspots

| File | Lines | Complexity | Issues |
|---|---|---|---|
| `src/lib/stock-logic.ts` | 969 | Very High | Monolithic, 5 concerns in 1 file, duplicated FIFO |
| `src/lib/db.ts` | 411 | High | Schema + migrations + seeding in 1 file |
| `src/app/(app)/stock-movement/page.tsx` | ~2,000 | Very High | 5 movement types, scanning, wizard, edit mode |
| `src/app/(app)/dashboard/page.tsx` | ~1,000 | High | 3 inline components, map view |
| `src/types/index.ts` | 274 | Medium | Duplicated interfaces, missing DB types |
| `src/lib/allocation.ts` | 107 | Medium | Duplicates FIFO logic from stock-logic |
| `src/lib/auth.ts` | 150 | Medium | Hardcoded secret, `as any` casts |
| `src/app/api/movement/route.ts` | 275 | High | Inline pending request logic, mixed concerns |
| `src/lib/validations.ts` | 117 | Low | Well-structured, no issues |
| `src/middleware.ts` | 43 | Low | Simple, no issues |
| `src/lib/utils.ts` | 119 | Medium | Date handling over-complicated |

---

## Appendix: Metrics

| Metric | Value |
|---|---|
| Total TypeScript/TSX files | ~80 |
| Total lines of code (approx) | ~15,000 |
| `as any` casts | 130+ |
| ESLint errors | Unknown (no lint output captured) |
| TypeScript errors | Logged in `typescript_errors.log`, `tsc_output.txt` |
| Test coverage | 0% formal, ad-hoc only |
| API routes | 30+ |
| Database tables | 15 |
| Documentation files | 8 markdown, 1 docx |
| Dependency count | 22 production, 9 dev |
