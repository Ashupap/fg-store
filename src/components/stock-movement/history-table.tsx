'use client';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Ban, Pencil, ScanBarcode, FileText, Printer, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { UserPublic } from '@/types';

interface MovementHistoryItem {
  id: number;
  movement_id: string;
  movement_datetime: string;
  action_type: string;
  from_location: string | null;
  to_location: string | null;
  type: string | null;
  variety: string | null;
  packing: string | null;
  grade: string | null;
  qty_mcs: number;
  status: string;
  moved_by_name: string | null;
}

interface HistoryFilters {
  fromDate: string;
  toDate: string;
  actionType: string;
  variety: string;
  status: string;
}

interface MasterData {
  varieties: string[];
  grades: string[];
  packings: string[];
  types: string[];
  coldStores: string[];
}

interface HistoryTableProps {
  history: MovementHistoryItem[];
  user: UserPublic | null;
  filters: HistoryFilters;
  setFilters: React.Dispatch<React.SetStateAction<HistoryFilters>>;
  masterData: MasterData | null;
  settings: Record<string, string>;
  onCancel: (movementId: string, status: string) => void;
  onEdit: (item: MovementHistoryItem) => void;
  onPrintReceipt: (movementId: string) => void;
  onPrintCodes: (movementId: string) => void;
  onPrintMasterReport: (movementId: string) => void;
}

function formatDisplayDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dt; }
}

function SelectFilter({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`h-8 text-xs py-0 bg-background/50 border border-border rounded-md ${className || ''}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function HistoryTable({ history, user, filters, setFilters, masterData, settings, onCancel, onEdit, onPrintReceipt, onPrintCodes, onPrintMasterReport }: HistoryTableProps) {
  const canManage = user?.role === 'admin' || user?.role === 'general_manager' || user?.role === 'manager';
  const canEdit = user?.role === 'admin' || user?.permissions?.includes('*') || user?.permissions?.includes('transaction:update');

  return (
    <Card className="lg:col-span-2 border-border/50 bg-card/40 flex flex-col h-[500px]">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="text-lg">Movement History</CardTitle>
            <CardDescription>Recent transaction log.</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-2 rounded-lg border border-border/40 mt-4">
          <Filter size={14} className="text-muted-foreground ml-1" />
          <div className="flex items-center gap-1">
            <Input type="date" value={filters.fromDate} onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))} className="h-8 text-xs py-1 w-32 bg-background/50" />
            <span className="text-muted-foreground">-</span>
            <Input type="date" value={filters.toDate} onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))} className="h-8 text-xs py-1 w-32 bg-background/50" />
          </div>
          <SelectFilter value={filters.actionType} onChange={v => setFilters(prev => ({ ...prev, actionType: v }))} options={[{ value: 'ALL', label: 'All Types' }, { value: 'INWARD', label: 'Inward' }, { value: 'TRANSFER', label: 'Transfer' }, { value: 'DISPATCH', label: 'Dispatch' }, { value: 'REPACK_OUT', label: 'Repack Out' }, { value: 'REPACK_IN', label: 'Repack In' }]} className="w-28" />
          <SelectFilter value={filters.variety} onChange={v => setFilters(prev => ({ ...prev, variety: v }))} options={[{ value: 'ALL', label: 'All Varieties' }, ...(masterData?.varieties || []).map(v => ({ value: v, label: v }))]} className="w-32" />
          <SelectFilter value={filters.status} onChange={v => setFilters(prev => ({ ...prev, status: v }))} options={[{ value: 'ALL', label: 'All Status' }, { value: 'Completed', label: 'Completed' }, { value: 'Pending Approval', label: 'Pending' }, { value: 'Rejected', label: 'Rejected' }]} className="w-32" />
          <Button onClick={() => setFilters({ fromDate: '', toDate: '', actionType: 'ALL', variety: 'ALL', status: 'ALL' })} variant="ghost" size="sm" className="h-8 px-2 text-xs">Clear</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="hidden md:block h-full overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card/95 backdrop-blur z-10">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">User</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDisplayDate(item.movement_datetime)}</TableCell>
                  <TableCell><Badge variant={item.action_type === 'INWARD' ? 'success' : item.action_type === 'TRANSFER' ? 'info' : 'warning'}>{item.action_type}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{item.qty_mcs} MCs</span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="font-medium text-sm">{item.variety} <span className="text-muted-foreground text-xs font-normal">({item.grade})</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded w-fit border border-border/30">
                        {item.action_type === 'INWARD' && <><ArrowDownToLine size={12} className="text-emerald-500" /><span>Received at</span><span className="font-semibold text-foreground">{item.to_location}</span></>}
                        {item.action_type === 'TRANSFER' && <><span className="font-semibold text-foreground">{item.from_location}</span><ArrowRight size={12} className="text-sky-500" /><span className="font-semibold text-foreground">{item.to_location}</span></>}
                        {item.action_type === 'DISPATCH' && <><span className="font-semibold text-foreground">{item.from_location}</span><ArrowUpRight size={12} className="text-amber-500" /><span className="font-semibold text-foreground">{item.to_location}</span></>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === 'Completed' ? 'outline' : item.status === 'Pending Approval' ? 'secondary' : item.status === 'Partial' ? 'destructive' : 'default'} className={item.status === 'Completed' ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/5' : item.status === 'Partial' ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' : ''}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{item.moved_by_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {canManage && item.action_type === 'TRANSFER' && ['Pending Approval', 'In Transit'].includes(item.status) && (
                        <Button onClick={() => onCancel(item.movement_id, item.status)} variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cancel Transfer">
                          <Ban size={14} className="text-rose-500" />
                        </Button>
                      )}
                      {canEdit && ['INWARD', 'TRANSFER', 'DISPATCH'].includes(item.action_type) && item.status !== 'Rejected' && (
                        <Button onClick={() => onEdit(item)} variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit/Correct Transaction">
                          <Pencil size={14} className="text-blue-500" />
                        </Button>
                      )}
                      {['INWARD', 'REPACK_IN'].includes(item.action_type) && item.status === 'Completed' && (
                        <Button onClick={() => onPrintCodes(item.movement_id)} variant="ghost" size="sm" className="h-8 w-8 p-0" title="Print Carton Codes">
                          <ScanBarcode size={14} className="text-indigo-600" />
                        </Button>
                      )}
                      {settings['enable_location_mapping'] === 'true' && ['INWARD', 'REPACK_IN', 'TRANSFER'].includes(item.action_type) && item.status === 'Completed' && (
                        <Button onClick={() => onPrintMasterReport(item.movement_id)} variant="ghost" size="sm" className="h-8 w-8 p-0" title="Print Master Report">
                          <FileText size={14} className="text-emerald-600" />
                        </Button>
                      )}
                      <Button onClick={() => onPrintReceipt(item.movement_id)} variant="ghost" size="sm" className="h-8 w-8 p-0" title="Print Receipt">
                        <Printer size={14} className="text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden space-y-3 p-4 overflow-y-auto h-full">
          {history.length === 0 ? (
            <p className="text-xs text-center py-8 text-muted-foreground">No recent transactions</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={item.action_type === 'INWARD' ? 'success' : item.action_type === 'TRANSFER' ? 'info' : 'warning'}>{item.action_type}</Badge>
                  <span className="text-muted-foreground text-xs">{formatDisplayDate(item.movement_datetime)}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{item.qty_mcs} MCs</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="font-semibold text-sm">{item.variety} <span className="text-muted-foreground text-xs font-normal">({item.grade})</span></span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{item.packing}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded w-fit border border-border/30 mt-2">
                    {item.action_type === 'INWARD' && <><ArrowDownToLine size={12} className="text-emerald-500" /><span>Received at {item.to_location}</span></>}
                    {item.action_type === 'TRANSFER' && <><span>{item.from_location}</span><ArrowRight size={12} className="text-sky-500" /><span>{item.to_location}</span></>}
                    {item.action_type === 'DISPATCH' && <><span>{item.from_location}</span><ArrowUpRight size={12} className="text-amber-500" /><span>{item.to_location}</span></>}
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-border/40">
                  <Badge variant={item.status === 'Completed' ? 'outline' : 'secondary'} className={item.status === 'Completed' ? 'border-emerald-500/30 text-emerald-600' : ''}>{item.status}</Badge>
                  <span className="text-muted-foreground">{item.moved_by_name}</span>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border/40">
                  {canManage && item.action_type === 'TRANSFER' && ['Pending Approval', 'In Transit'].includes(item.status) && (
                    <Button onClick={() => onCancel(item.movement_id, item.status)} variant="outline" size="sm" className="h-8 text-xs">Cancel</Button>
                  )}
                  {canEdit && ['INWARD', 'TRANSFER', 'DISPATCH'].includes(item.action_type) && item.status !== 'Rejected' && (
                    <Button onClick={() => onEdit(item)} variant="outline" size="sm" className="h-8 text-xs">Edit</Button>
                  )}
                  <Button onClick={() => onPrintReceipt(item.movement_id)} variant="ghost" size="sm" className="h-8 text-xs ml-auto">Print</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
