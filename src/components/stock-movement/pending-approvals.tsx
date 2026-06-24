'use client';
import { Clock, CheckCircle, Check, Ban, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { UserPublic } from '@/types';

interface PendingMovement {
  id: number;
  movement_id: string;
  movement_datetime: string;
  action_type: string;
  status: string;
  from_location: string | null;
  to_location: string | null;
  type: string | null;
  variety: string | null;
  packing: string | null;
  grade: string | null;
  qty_mcs: number;
  moved_by_name: string | null;
}

interface PendingApprovalsProps {
  requests: PendingMovement[];
  user: UserPublic;
  onEdit: (req: PendingMovement) => void;
  onApprove: (movementId: string) => void;
  onReject: (movementId: string) => void;
  onAccept: (movementId: string) => void;
}

function formatDisplayDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return dt; }
}

function formatDisplayDate(dt: string) {
  try {
    return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return dt; }
}

export function PendingApprovals({ requests, user, onEdit, onApprove, onReject, onAccept }: PendingApprovalsProps) {
  if (requests.length === 0) return null;

  const canManage = user.role === 'admin' || user.role === 'manager';

  return (
    <Card className="border-l-4 border-l-amber-500 bg-amber-500/5 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2 text-amber-600">
          <Clock size={20} />
          Pending Approvals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop Table View */}
        <div className="hidden md:block rounded-md border border-border/50 bg-background/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Requested By</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="text-muted-foreground text-sm">{formatDisplayDateTime(req.movement_datetime)}</TableCell>
                  <TableCell>
                    <Badge variant={req.status === 'In Transit' ? 'secondary' : (req.action_type === 'INWARD' ? 'success' : req.action_type === 'TRANSFER' ? 'info' : req.action_type === 'REPACK_OUT' ? 'warning' : 'info')}>
                      {req.status === 'In Transit' ? 'In Transit' : req.action_type.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{req.variety} <span className="text-muted-foreground font-normal">({req.grade})</span></div>
                    <div className="text-xs text-muted-foreground">{req.packing}</div>
                    <div className="text-xs mt-1 font-mono">{req.from_location ? `${req.from_location} → ` : ''}{req.to_location}</div>
                  </TableCell>
                  <TableCell className="font-semibold">{req.qty_mcs} MCs</TableCell>
                  <TableCell className="text-sm">{req.moved_by_name}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {req.status === 'In Transit' ? (
                          <Button onClick={() => onAccept(req.movement_id)} size="sm" className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center gap-1" title="Accept Transfer">
                            <CheckCircle size={14} /> Accept
                          </Button>
                        ) : (
                          <>
                            <Button onClick={() => onEdit(req)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Edit Request">
                              <Pencil size={14} />
                            </Button>
                            <Button onClick={() => onApprove(req.movement_id)} size="sm" className="h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600 rounded-full" title="Approve">
                              <Check size={14} />
                            </Button>
                            <Button onClick={() => onReject(req.movement_id)} size="sm" variant="destructive" className="h-8 w-8 p-0 rounded-full" title="Reject">
                              <Ban size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={req.status === 'In Transit' ? 'secondary' : (req.action_type === 'INWARD' ? 'success' : req.action_type === 'TRANSFER' ? 'info' : req.action_type === 'REPACK_OUT' ? 'warning' : 'info')}>
                  {req.status === 'In Transit' ? 'In Transit' : req.action_type.replace('_', ' ')}
                </Badge>
                <span className="text-muted-foreground text-xs">{formatDisplayDate(req.movement_datetime)}</span>
              </div>
              <div>
                <div className="font-semibold text-sm">{req.variety} <span className="text-muted-foreground text-xs">({req.grade})</span></div>
                <div className="text-xs text-muted-foreground">{req.packing}</div>
                <div className="text-xs mt-1 font-mono bg-muted/40 px-2 py-1 rounded w-fit">{req.from_location ? `${req.from_location} → ` : ''}{req.to_location}</div>
              </div>
              <div className="flex justify-between items-center text-xs pt-1.5 border-t border-border/40">
                <div><span className="text-muted-foreground">Qty: </span><span className="font-bold">{req.qty_mcs} MCs</span></div>
                <div><span className="text-muted-foreground">By: </span><span className="font-medium">{req.moved_by_name}</span></div>
              </div>
              {canManage && (
                <div className="flex gap-2 pt-2 border-t border-border/40">
                  {req.status === 'In Transit' ? (
                    <Button onClick={() => onAccept(req.movement_id)} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-1.5 h-9">
                      <CheckCircle size={14} /> Accept Transfer
                    </Button>
                  ) : (
                    <div className="flex w-full gap-2 justify-end">
                      <Button onClick={() => onEdit(req)} size="sm" variant="outline" className="flex-1 h-9 flex items-center justify-center gap-1.5">
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button onClick={() => onApprove(req.movement_id)} size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white h-9 flex items-center justify-center gap-1.5">
                        <Check size={14} /> Approve
                      </Button>
                      <Button onClick={() => onReject(req.movement_id)} size="sm" variant="destructive" className="h-9 w-9 p-0 rounded-lg shrink-0 flex items-center justify-center">
                        <Ban size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
