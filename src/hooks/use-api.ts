import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Stock Hooks ────────────────────────────────────────────────
export function useStockSummary(store?: string) {
  return useQuery({
    queryKey: ['stock', 'summary', store],
    queryFn: async () => {
      const params = store ? `?store=${encodeURIComponent(store)}` : '';
      const res = await fetch(`/api/stock${params}`);
      if (!res.ok) throw new Error('Failed to fetch stock');
      return res.json();
    },
  });
}

export function useStockFilters() {
  return useQuery({
    queryKey: ['stock', 'filters'],
    queryFn: async () => {
      const res = await fetch('/api/stock/filters');
      if (!res.ok) throw new Error('Failed to fetch filters');
      return res.json();
    },
  });
}

export function useStockLocate(mcNumber: string) {
  return useQuery({
    queryKey: ['stock', 'locate', mcNumber],
    queryFn: async () => {
      const res = await fetch(`/api/stock/locate?mc=${encodeURIComponent(mcNumber)}`);
      if (!res.ok) throw new Error('Failed to locate stock');
      return res.json();
    },
    enabled: !!mcNumber,
  });
}

export function useBatchesByDate(store: string, date: string) {
  return useQuery({
    queryKey: ['stock', 'batches', store, date],
    queryFn: async () => {
      const res = await fetch(`/api/stock/batches-by-date?store=${encodeURIComponent(store)}&date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error('Failed to fetch batches');
      return res.json();
    },
    enabled: !!store && !!date,
  });
}

export function useAllocatedStock() {
  return useQuery({
    queryKey: ['stock', 'allocated'],
    queryFn: async () => {
      const res = await fetch('/api/stock/allocated');
      if (!res.ok) throw new Error('Failed to fetch allocated stock');
      return res.json();
    },
  });
}

// ─── Movement Hooks ─────────────────────────────────────────────
export function useCreateMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch('/api/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create movement');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}

export function usePendingMovements(store?: string) {
  return useQuery({
    queryKey: ['movement', 'pending', store],
    queryFn: async () => {
      const params = store ? `?store=${encodeURIComponent(store)}` : '';
      const res = await fetch(`/api/movement/pending${params}`);
      if (!res.ok) throw new Error('Failed to fetch pending movements');
      return res.json();
    },
  });
}

export function useMovementDetail(id: string) {
  return useQuery({
    queryKey: ['movement', id],
    queryFn: async () => {
      const res = await fetch(`/api/movement/${id}`);
      if (!res.ok) throw new Error('Failed to fetch movement');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useApproveMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movementId: string) => {
      const res = await fetch(`/api/movement/${movementId}/approve`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to approve');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}

export function useRejectMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ movementId, reason }: { movementId: string; reason?: string }) => {
      const res = await fetch(`/api/movement/${movementId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reject');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}

export function useAcceptMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movementId: string) => {
      const res = await fetch(`/api/movement/${movementId}/accept`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to accept');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}

export function useCancelMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movementId: string) => {
      const res = await fetch(`/api/movement/${movementId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['movement'] });
    },
  });
}

// ─── PO Hooks ───────────────────────────────────────────────────
export function usePOList() {
  return useQuery({
    queryKey: ['po'],
    queryFn: async () => {
      const res = await fetch('/api/po');
      if (!res.ok) throw new Error('Failed to fetch POs');
      return res.json();
    },
  });
}

export function usePODetail(id: number) {
  return useQuery({
    queryKey: ['po', id],
    queryFn: async () => {
      const res = await fetch(`/api/po/${id}`);
      if (!res.ok) throw new Error('Failed to fetch PO');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreatePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch('/api/po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create PO');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po'] });
    },
  });
}

export function usePOStock(poId: number, store?: string) {
  return useQuery({
    queryKey: ['po', poId, 'stock', store],
    queryFn: async () => {
      const params = store ? `?store=${encodeURIComponent(store)}` : '';
      const res = await fetch(`/api/po/${poId}/stock${params}`);
      if (!res.ok) throw new Error('Failed to fetch PO stock');
      return res.json();
    },
    enabled: !!poId,
  });
}

export function useAllocatePO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (poId: number) => {
      const res = await fetch(`/api/po/${poId}/allocate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to allocate PO');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

// ─── Dashboard Hooks ────────────────────────────────────────────
export function useDashboard(filters?: { type?: string; variety?: string; grade?: string }) {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type && filters.type !== 'all') params.append('type', filters.type);
      if (filters?.variety && filters.variety !== 'all') params.append('variety', filters.variety);
      if (filters?.grade && filters.grade !== 'all') params.append('grade', filters.grade);
      const qs = params.toString();
      const res = await fetch(`/api/dashboard${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard');
      return res.json();
    },
  });
}

export function useDashboardCapacity() {
  return useQuery({
    queryKey: ['dashboard', 'capacity'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/capacity');
      if (!res.ok) throw new Error('Failed to fetch capacity');
      return res.json();
    },
  });
}

// ─── Shipment Hooks ─────────────────────────────────────────────
export function useShipmentList() {
  return useQuery({
    queryKey: ['shipment'],
    queryFn: async () => {
      const res = await fetch('/api/shipment/list');
      if (!res.ok) throw new Error('Failed to fetch shipments');
      return res.json();
    },
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const res = await fetch('/api/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create shipment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment'] });
      queryClient.invalidateQueries({ queryKey: ['po'] });
    },
  });
}

export function useVerifyShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shipmentId, mcNumber }: { shipmentId: string; mcNumber: string }) => {
      const res = await fetch(`/api/shipment/${shipmentId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcNumber }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to verify');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment'] });
    },
  });
}

// ─── Admin Hooks ────────────────────────────────────────────────
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/admin/roles');
      if (!res.ok) throw new Error('Failed to fetch roles');
      return res.json();
    },
  });
}

export function useSections(store?: string) {
  return useQuery({
    queryKey: ['sections', store],
    queryFn: async () => {
      const params = store ? `?store=${encodeURIComponent(store)}` : '';
      const res = await fetch(`/api/admin/sections${params}`);
      if (!res.ok) throw new Error('Failed to fetch sections');
      return res.json();
    },
  });
}

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stores');
      if (!res.ok) throw new Error('Failed to fetch stores');
      return res.json();
    },
  });
}

// ─── Report Hooks ───────────────────────────────────────────────
export function useLedgerReport(store: string, filters?: { variety?: string; grade?: string; packing?: string; fromDate?: string; toDate?: string }) {
  return useQuery({
    queryKey: ['reports', 'ledger', store, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ store });
      if (filters?.variety) params.set('variety', filters.variety);
      if (filters?.grade) params.set('grade', filters.grade);
      if (filters?.packing) params.set('packing', filters.packing);
      if (filters?.fromDate) params.set('fromDate', filters.fromDate);
      if (filters?.toDate) params.set('toDate', filters.toDate);
      const res = await fetch(`/api/reports/ledger?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch ledger');
      return res.json();
    },
    enabled: !!store,
  });
}

export function useYieldReport(filters?: { fromDate?: string; toDate?: string }) {
  return useQuery({
    queryKey: ['reports', 'yield', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.fromDate) params.set('fromDate', filters.fromDate);
      if (filters?.toDate) params.set('toDate', filters.toDate);
      const res = await fetch(`/api/reports/yield?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch yield report');
      return res.json();
    },
  });
}
