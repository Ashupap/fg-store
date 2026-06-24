# FGStore — Comprehensive Implementation Plan

> **Version:** 1.0
> **Date:** June 24, 2026
> **Based on:** `codebase_analysis_report.md`
> **Total estimated effort:** 12-14 weeks (3 months)

---

## How to Read This Plan

Each phase has:
- **Objective** — What we're achieving
- **Tasks** — Granular work items with estimates
- **Dependencies** — What must be done first
- **Success criteria** — How we know it's done
- **Risk level** — Low / Medium / High

---

## Phase 0: Quick Wins (Week 1)
**Theme:** Security + Type Safety + Developer Experience

### Estimated effort: 3-4 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 0.1 Fix hardcoded JWT secret | 30 min | None | Low |
| 0.2 Remove duplicate type definitions | 30 min | None | Low |
| 0.3 Remove duplicate DB file at root | 10 min | Confirm no script uses it | Low |
| 0.4 Add proper `.env.example` with all vars | 1 hr | None | Low |
| 0.5 Add `.gitkeep` in `data/` directory | 5 min | None | Low |
| 0.6 Replace `globalThis.Map` with `new Map()` | 5 min | None | Low |
| 0.7 Add ESLint config for `no-explicit-any` warning | 1 hr | None | Low |
| 0.8 Add `npm run typecheck` script | 10 min | None | Low |

### Task 0.1 — Fix hardcoded JWT secret
**File:** `src/lib/auth.ts`
**Change:**
```typescript
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    return 'dev-secret-do-not-use-in-production';
  }
  return secret;
})();
```

**Success criteria:** App crashes on startup if `JWT_SECRET` is missing in production.

### Task 0.2 — Remove duplicate types
**File:** `src/types/index.ts`
**Change:** Remove the second `LoginCredentials` (lines 196-199) and `AuthToken` (lines 201-207) definitions. Keep only the first definitions (lines 29-41) which already include `username`.

**Success criteria:** No duplicate interface warnings in IDE.

### Task 0.3 — Remove duplicate DB file
**File:** `fg_store.db` at root (delete it — `data/fg-store.db` is the canonical one)

**Success criteria:** Clean git status after removal.

### Task 0.4 — Proper .env.example
**File:** `.env.example`
```
# Required
JWT_SECRET=your-secret-key-min-32-chars-long

# Environment
NODE_ENV=development

# Optional (with defaults)
DATABASE_PATH=data/fg-store.db
LOG_LEVEL=info
```

**Success criteria:** Clear documentation of all env vars.

---

## Phase 1: Foundation — Testing & Type Safety (Week 2-3)
**Theme:** Stop the bleeding — make the codebase testable and type-safe

### Estimated effort: 10-12 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 1.1 Add Vitest + configuration | 1 day | Phase 0 | Medium |
| 1.2 Create typed DB result helpers | 3 days | None | High |
| 1.3 Eliminate `as any` in stock-logic.ts | 1 day | 1.2 | Medium |
| 1.4 Eliminate `as any` in API routes | 2 days | 1.2 | Medium |
| 1.5 Eliminate `as any` in auth.ts | 0.5 day | 1.2 | Low |
| 1.6 Write unit tests for allocation.ts | 1 day | 1.1 | Low |
| 1.7 Write unit tests for stock-logic.ts (inward) | 1 day | 1.1, 1.3 | Medium |
| 1.8 Write unit tests for validations.ts | 0.5 day | 1.1 | Low |
| 1.9 Add CI workflow (GitHub Actions) | 1 day | 1.1 | Medium |
| 1.10 Fix all existing TypeScript errors | 1 day | 1.2 | Medium |

### Task 1.1 — Add Vitest
**Install:**
```bash
npm i -D vitest @vitest/coverage-v8
```

**File:** `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/*.ts'],
      exclude: ['src/lib/db.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**File:** `package.json` — add script:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Success criteria:** `npm test` runs and passes.

### Task 1.2 — Create typed DB helpers
**File:** `src/lib/db-types.ts` (new)
**Purpose:** Create wrapper types for all query results so we never need `as any`.

**Pattern:**
```typescript
export type UserRow = {
  id: number;
  username: string | null;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type StockRow = {
  id: number;
  mc_number: string;
  grade: string;
  variety: string | null;
  type: string | null;
  packing_code: string;
  packing_date: string;
  cold_store: string;
  status: string;
  reserved_for_po: string | null;
  // ...
};

// Helper to safely cast DB results
export function getRow<T>(row: unknown): T {
  return row as T;
}

export function getAllRows<T>(rows: unknown[]): T[] {
  return rows as T[];
}
```

**Success criteria:** Every `db.prepare().get()` and `.all()` call uses typed helpers.

### Task 1.9 — CI Workflow
**File:** `.github/workflows/ci.yml`
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

**Success criteria:** PRs block merge on test/lint/typecheck failure.

---

## Phase 2: Architecture — Service Layer (Week 3-4)
**Theme:** Separate concerns, reduce file sizes, enable DI for testing

### Estimated effort: 8-10 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 2.1 Create `StockService` class with DI | 3 days | 1.3 | High |
| 2.2 Create `AllocationService` | 1 day | 2.1 | Medium |
| 2.3 Create `MovementService` | 2 days | 2.1 | Medium |
| 2.4 Create `UserService` | 1 day | None | Low |
| 2.5 Refactor API routes to use services | 2 days | 2.1-2.4 | Medium |
| 2.6 Add DB transaction wrapper utility | 1 day | None | Low |

### Task 2.1 — StockService
**File:** `src/services/stock-service.ts` (new)

**Pattern:**
```typescript
export class StockService {
  constructor(private db: Database.Database) {}

  async handleInward(data: InwardInput, userId: number): Promise<MovementResult> {
    // Validation
    const parsed = inwardMovementSchema.parse(data);
    // Business logic (extracted from stock-logic.ts)
    // DB operations via this.db
  }

  async handleTransfer(data: TransferInput, userId: number): Promise<MovementResult> {
    // ...
  }
}
```

**Why DI matters:**
```typescript
// In tests:
const mockDb = createMockDb();
const service = new StockService(mockDb);
await service.handleInward(testData, 1);
// No need for real SQLite!
```

**Success criteria:** `stock-logic.ts` is deleted; logic lives in `StockService`.

### Task 2.6 — Transaction wrapper
**File:** `src/lib/transaction.ts` (new)
```typescript
import { getDb } from './db';
import type Database from 'better-sqlite3';

export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const tx = db.transaction(() => fn(db));
  return tx();
}
```

**Success criteria:** All multi-step DB operations use `withTransaction`.

---

## Phase 3: Frontend — React Query & Component Splitting (Week 4-6)
**Theme:** Modern data fetching, eliminate monolithic pages

### Estimated effort: 12-15 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 3.1 Set up React Query provider in app layout | 0.5 day | None | Low |
| 3.2 Create custom hooks for all API endpoints | 3 days | 3.1 | Medium |
| 3.3 Split StockMovementPage — create ActionHub | 1 day | 3.2 | Medium |
| 3.4 Split StockMovementPage — create MovementWizard | 3 days | 3.2 | High |
| 3.5 Split StockMovementPage — create PendingApprovals | 1 day | 3.2 | Medium |
| 3.6 Split StockMovementPage — create HistoryTable | 1 day | 3.2 | Low |
| 3.7 Split DashboardPage — extract WarehouseGridMap | 1 day | None | Low |
| 3.8 Split DashboardPage — extract StatsCards | 0.5 day | None | Low |
| 3.9 Add error boundaries to each section | 1 day | None | Low |
| 3.10 Add loading skeletons (Skeleton components) | 2 days | None | Medium |
| 3.11 Add list virtualization (react-window or similar) | 2 days | 3.6 | Medium |

### Task 3.1 — React Query Provider
**File:** `src/app/providers.tsx` (new)
```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,     // 30 seconds
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

Wrap in `src/app/layout.tsx`.

### Task 3.2 — Custom Hooks
**File:** `src/hooks/use-stock.ts`, `src/hooks/use-movement.ts`, etc. (new)

**Pattern:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useStockSummary(filters: StockFilters) {
  return useQuery({
    queryKey: ['stock', 'summary', filters],
    queryFn: () => fetch('/api/stock').then(r => r.json()),
  });
}

export function useCreateMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      fetch('/api/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}
```

**Benefits over raw fetch:** Automatic caching, deduplication, background refetch, stale data display while revalidating.

### Task 3.9 — Error Boundaries
**File:** `src/components/ui/error-boundary.tsx`
```typescript
'use client';
import { Component } from 'react';

interface Props { fallback?: React.ReactNode; children: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center text-destructive">
          <p>Something went wrong loading this section.</p>
          <button onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## Phase 4: Infrastructure — Security & Operations (Week 6-7)
**Theme:** Production hardening

### Estimated effort: 8-10 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 4.1 Add CSRF protection | 1 day | None | High |
| 4.2 Add rate limiting on login | 1 day | None | Medium |
| 4.3 Add health check endpoint | 1 day | None | Low |
| 4.4 Add structured logging (Pino) | 1 day | None | Low |
| 4.5 Add request logging middleware | 1 day | 4.4 | Low |
| 4.6 Add docker-compose health checks + restart | 0.5 day | None | Low |
| 4.7 Add server-side pagination to list endpoints | 2 days | Phase 2 | Medium |
| 4.8 Add API response compression | 0.5 day | None | Low |
| 4.9 Harden cookie settings (secure, sameSite) | 0.5 day | None | Medium |

### Task 4.1 — CSRF Protection
**Approach:** Double-submit cookie pattern.

**File:** `src/lib/csrf.ts` (new)
```typescript
import { cookies } from 'next/headers';
import crypto from 'crypto';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCsrf(token: string): boolean {
  // Compare against cookie
}
```

**Middleware check:** Validate CSRF token on all POST/PUT/DELETE requests.

### Task 4.2 — Rate Limiting
**File:** `src/lib/rate-limit.ts` (new)
```typescript
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= maxAttempts) return false;
  record.count++;
  return true;
}
```

### Task 4.7 — Server-side pagination
**Files:** All GET list endpoints (`/api/movement`, `/api/stock`, `/api/po`, `/api/shipment/list`)

**Standard response shape:**
```typescript
{
  success: true,
  data: T[],
  pagination: {
    page: number,
    pageSize: number,
    total: number,
    totalPages: number,
  }
}
```

---

## Phase 5: Database — Migrations & Performance (Week 7-8)
**Theme:** Schema management, query optimization, data integrity

### Estimated effort: 8-10 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 5.1 Extract migrations from db.ts to migration files | 2 days | None | High |
| 5.2 Add migration runner with version tracking | 1 day | 5.1 | Medium |
| 5.3 Add proper datetime handling (date-fns throughout) | 2 days | None | Medium |
| 5.4 Add composite indexes for common query patterns | 1 day | None | Low |
| 5.5 Add database connection retry logic | 1 day | None | Low |
| 5.6 Add WAL checkpoint scheduling | 0.5 day | None | Low |
| 5.7 Add automated backup mechanism | 1 day | None | Medium |
| 5.8 Add data integrity constraints (CASCADE, CHECK) | 1 day | 5.1 | Medium |

### Task 5.1 — Migration files
**Directory:** `src/migrations/`
**File:** `src/migrations/001-initial-schema.ts`
**File:** `src/migrations/002-add-barcodes.ts`
**File:** `src/migrations/003-add-repacking.ts`
**File:** `src/migrations/004-add-sections.ts`

**Migration runner:**
```typescript
// src/lib/migrate.ts
const MIGRATIONS_TABLE = '_migrations';
// Track applied migrations in DB
// Apply pending migrations in order
```

### Task 5.4 — Composite indexes
```sql
-- Common query: find stock by store + status + variety
CREATE INDEX idx_stock_lookup ON fg_stock_master(cold_store, status, variety, grade);

-- Common query: find stock for PO allocation
CREATE INDEX idx_stock_allocation ON fg_stock_master(type, variety, grade, packing_code, status);

-- Movement history filtering
CREATE INDEX idx_movement_lookup ON stock_movement_log(action_type, movement_datetime, from_location);
```

---

## Phase 6: Features — PWA, Realtime & Notifications (Week 8-10)
**Theme:** Modern UX, operational excellence

### Estimated effort: 12-15 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 6.1 Add PWA manifest + service worker | 2 days | None | Medium |
| 6.2 Add IndexedDB offline scan queue | 3 days | 6.1 | High |
| 6.3 Add SSE for real-time dashboard | 2 days | None | Medium |
| 6.4 Add WebSocket for live scan verification | 2 days | 6.3 | Medium |
| 6.5 Add health monitor page (admin) | 1 day | 4.3 | Low |
| 6.6 Add API documentation (Scalar/Swagger) | 3 days | Phase 2 | Medium |
| 6.7 Add Excel export for movement history | 1 day | None | Low |

### Task 6.1 — PWA
**File:** `src/app/manifest.ts` or `public/manifest.json`
```json
{
  "name": "FGStore",
  "short_name": "FGStore",
  "description": "Seafood Cold Store Inventory Management",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2E8B57",
  "icons": [...]
}
```

**Service worker:** Use `next-pwa` or `serwist` for Next.js 16 compatibility.

### Task 6.2 — Offline scan queue
**Pattern:**
1. User scans barcode → stored in IndexedDB (not API call)
2. Service worker detects connectivity
3. Batch-sync pending scans to API
4. Show sync status in UI (pending/syncing/error)

---

## Phase 7: Communications — WhatsApp & Email (Week 10-11)
**Theme:** Proactive alerts, stakeholder notifications

### Estimated effort: 7-10 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 7.1 Set up Ecolution WhatsApp API client | 2 days | None | Medium |
| 7.2 Add aging stock alert cron | 1 day | 7.1 | Medium |
| 7.3 Add pending approval notification | 1 day | 7.1 | Low |
| 7.4 Add dispatch confirmation to customer | 1 day | 7.1 | Low |
| 7.5 Add email service (Resend/SendGrid) | 1 day | None | Low |
| 7.6 Add email PDF manifest attachment | 1 day | 7.5 | Medium |
| 7.7 Add notification preference settings | 1 day | 7.1, 7.5 | Low |

### Architecture for notifications
```typescript
// src/services/notification-service.ts
export interface NotificationChannel {
  send(to: string, message: string, attachments?: Attachment[]): Promise<boolean>;
}

export class WhatsAppChannel implements NotificationChannel { /* ... */ }
export class EmailChannel implements NotificationChannel { /* ... */ }

export class NotificationService {
  constructor(private channels: NotificationChannel[]) {}

  async notify(event: NotificationEvent) {
    for (const channel of this.channels) {
      await channel.send(event.recipient, event.message, event.attachments);
    }
  }
}
```

---

## Phase 8: External Integration — REST API & Webhooks (Week 11-12)
**Theme:** API-first, enable 3rd party integrations

### Estimated effort: 8-10 days

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 8.1 Create API key authentication | 2 days | Phase 2 | Medium |
| 8.2 Create external API routes (read-only) | 2 days | 8.1 | Medium |
| 8.3 Create webhook system | 2 days | 8.1 | High |
| 8.4 Create webhook delivery + retry logic | 1 day | 8.3 | Medium |
| 8.5 Create API rate limiting for external keys | 1 day | 8.1 | Low |
| 8.6 Generate OpenAPI/Swagger spec | 1 day | 8.2 | Low |
| 8.7 Create webhook management UI (admin) | 1 day | 8.3 | Low |

### API Key Model
```typescript
// New table: api_keys
// id, key_hash, name, permissions (JSON), is_active, last_used_at, created_at

// Auth middleware checks:
// 1. Is it a browser session? → Check JWT cookie
// 2. Is it an API call? → Check X-API-Key header
// 3. Validate key hash, check permissions
```

### Webhook Events
```
stock.inward.created
stock.transfer.completed
stock.dispatch.completed
po.created
po.fulfilled
po.dispatched
shipment.shipped
```

---

## Phase 9: Future — AI & IoT (Quarter 2+)
**Theme:** Innovation, differentiation

### Estimated effort: 15-20 days (spread across sprints)

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 9.1 Gemini AI — stock query bot | 5 days | 7.1 | High |
| 9.2 Gemini AI — production log OCR | 5 days | None | High |
| 9.3 Gemini AI — anomaly detection | 3 days | None | Medium |
| 9.4 IoT — Sensitech/Testo integration | 5 days | None | High |
| 9.5 IoT — temperature excursion alerts | 2 days | 9.4 | Medium |
| 9.6 Container tracking — Project44/Vizion | 5 days | 8.2 | High |
| 9.7 Accounting — QuickBooks/Xero sync | 5 days | 8.2 | High |

---

## Phase 10: Polish & Performance (Ongoing)
**Theme:** UX refinement, performance optimization

| Task | Estimate | Dependencies | Risk |
|---|---|---|---|
| 10.1 Replace all spinners with skeleton UIs | 3 days | Phase 3 | Low |
| 10.2 Add optimistic updates to mutations | 2 days | 3.2 | Medium |
| 10.3 Add keyboard shortcuts for power users | 2 days | None | Low |
| 10.4 Add dark mode support (currently light only) | 2 days | None | Low |
| 10.5 Add audit log viewer with filtering | 1 day | None | Low |
| 10.6 Add batch operations (select multiple MCs) | 2 days | Phase 3 | Medium |
| 10.7 Add data export presets | 1 day | None | Low |
| 10.8 Add performance monitoring (Web Vitals) | 1 day | None | Low |

---

## Dependency Graph

```
Phase 0 ─────────────────────────────────────────────────────────
  │
Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4
  │            │            │            │
  │            ├────────────┤            │
  │            │                         │
  │            ▼                         │
  │         Phase 5 ◄────────────────────┘
  │            │
  │            ▼
  │         Phase 6
  │            │
  │            ▼
  │         Phase 7
  │            │
  │            ▼
  │         Phase 8 ─── Phase 9 (parallel)
  │
  └────────── Phase 10 (ongoing)
```

**Parallel tracks possible:**
- Phase 2 (Service Layer) + Phase 1 (Testing) — can partially overlap
- Phase 6 (PWA) + Phase 7 (Notifications) — independent
- Phase 9 (AI/IoT) — independent, can start earlier if resources available

---

## Resource Requirements

### Skills needed
- **TypeScript / Next.js** — all phases
- **Testing (Vitest)** — Phase 1
- **Database design (SQLite)** — Phase 5
- **DevOps (Docker, CI)** — Phase 1, 4
- **Frontend architecture** — Phase 3
- **PWA / Service Workers** — Phase 6
- **API design (OpenAPI)** — Phase 8
- **AI/ML (Gemini API)** — Phase 9
- **IoT integration** — Phase 9

### Recommended team
| Role | Phases | Allocation |
|---|---|---|
| 1 Senior Full-Stack Developer | 0, 1, 2, 4, 5 | Full-time (12 weeks) |
| 1 Frontend Developer | 3, 6, 10 | Full-time (weeks 4-10) |
| 1 DevOps / QA | 1 (CI), 4, 8 | Part-time (weeks 1-12) |
| 1 Integration Specialist | 7, 8, 9 | Part-time (weeks 10-12+) |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| SQLite migration to PostgreSQL is harder than estimated | Medium | High | Start read-replica testing early |
| PWA offline sync conflicts with server state | Medium | High | Use CRDT or last-write-wins strategy |
| WhatsApp API has delivery delays | Low | Medium | Add email as fallback channel |
| Gemini API costs exceed budget | Medium | Medium | Implement query budget + caching |
| Team unfamiliar with React Query slows Phase 3 | Medium | Medium | Allocate 2-day spike before starting |
| Database schema changes break existing data | Low | High | Add dry-run mode to all migrations |

---

## Success Metrics

### Technical
- [ ] 100% removal of `as any` casts
- [ ] Test coverage > 60% for `src/lib/` and `src/services/`
- [ ] CI green on all PRs
- [ ] P95 API response time < 200ms
- [ ] Zero TypeScript errors
- [ ] Lighthouse score > 90 for all pages

### Business
- [ ] WhatsApp alerts reach managers within 1 minute of event
- [ ] Offline scanning works without internet for 8+ hours
- [ ] API documentation covers 100% of external endpoints
- [ ] Automated backups running nightly with verified restore

---

## Appendix: Quick Reference

### Commands for each phase

```bash
# Phase 0
npm install            # Already done
npm run typecheck      # Track type error reduction

# Phase 1
npm i -D vitest
npm test               # Should show 0 tests initially, then growing

# Phase 3
npm run dev            # Verify React Query devtools

# Phase 4
npm run build          # Verify production build
```

### File creation summary by phase

| Phase | New files |
|---|---|
| 0 | — (edits only) |
| 1 | `vitest.config.ts`, `src/lib/db-types.ts`, `.github/workflows/ci.yml` |
| 2 | `src/services/stock-service.ts`, `src/services/allocation-service.ts`, `src/services/movement-service.ts`, `src/services/user-service.ts`, `src/lib/transaction.ts` |
| 3 | `src/app/providers.tsx`, `src/hooks/use-stock.ts`, `src/hooks/use-movement.ts`, `src/hooks/use-po.ts`, `src/hooks/use-admin.ts`, `src/components/stock-movement/*.tsx`, `src/components/ui/error-boundary.tsx`, `src/components/ui/skeleton.tsx` |
| 4 | `src/lib/csrf.ts`, `src/lib/rate-limit.ts`, `src/app/api/health/route.ts`, `src/lib/logger.ts` |
| 5 | `src/migrations/*.ts`, `src/lib/migrate.ts` |
| 6 | `public/manifest.json`, `public/sw.js`, `src/app/api/events/route.ts` |
| 7 | `src/services/notification-service.ts`, `src/services/whatsapp-service.ts`, `src/services/email-service.ts` |
| 8 | `src/lib/api-key-auth.ts`, `src/app/api/external/*/route.ts`, `src/services/webhook-service.ts` |
