'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ClipboardList,
    ArrowLeft,
    Plus,
    RefreshCw,
    LogOut,
    ChevronDown,
    ChevronRight,
    Package,
    CheckCircle,
    XCircle,
    AlertCircle,
    X,
    Grid,
    Search,
    Zap,
    Truck
} from 'lucide-react';
import type { POWithLineItems, POLineItemWithDetails, UserPublic } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface MasterData {
    grades: string[];
    varieties: string[];
    packings: string[];
    types: string[];
    coldStores: string[];
}

export default function POAllocationPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserPublic | null>(null);
    const [loading, setLoading] = useState(true);
    const [pos, setPOs] = useState<POWithLineItems[]>([]);
    const [masterData, setMasterData] = useState<MasterData | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedPO, setExpandedPO] = useState<number | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Create PO form state
    const [newPO, setNewPO] = useState({
        poNumber: '',
        orderDate: new Date().toISOString().split('T')[0],
        lineItems: [{ type: '', variety: '', grade: '', packing: '', qty: '' }],
    });

    // Check authentication
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await fetch('/api/auth/me');
                const result = await response.json();

                if (result.success) {
                    setUser(result.user);
                    // Role-based access control
                    const allowedRoles = ['admin', 'general_manager', 'marketing_manager'];
                    if (!allowedRoles.includes(result.user.role)) {
                        router.push('/dashboard');
                    }
                } else {
                    router.push('/login');
                }
            } catch (error) {
                router.push('/login');
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    // Fetch data
    useEffect(() => {
        if (user) {
            fetchPOs();
            fetchMasterData();
        }
    }, [user, statusFilter]);

    const fetchPOs = async () => {
        try {
            const response = await fetch(`/api/po?status=${statusFilter}`);
            const result = await response.json();
            if (result.success) {
                setPOs(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch POs:', error);
        }
    };

    const fetchMasterData = async () => {
        try {
            const response = await fetch('/api/master-data');
            const result = await response.json();
            if (result.success) {
                setMasterData(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch master data:', error);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const handleCreatePO = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const payload = {
                poNumber: newPO.poNumber,
                orderDate: newPO.orderDate,
                lineItems: newPO.lineItems.map(item => ({
                    type: item.type,
                    variety: item.variety,
                    grade: item.grade,
                    packing: item.packing,
                    qty: parseInt(item.qty, 10),
                })),
            };

            const response = await fetch('/api/po', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.success) {
                setToast({ type: 'success', message: 'PO created successfully!' });
                setShowCreateModal(false);
                setNewPO({
                    poNumber: '',
                    orderDate: new Date().toISOString().split('T')[0],
                    lineItems: [{ type: '', variety: '', grade: '', packing: '', qty: '' }],
                });
                fetchPOs();
            } else {
                setToast({ type: 'error', message: result.error || 'Failed to create PO' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Failed to create PO' });
        } finally {
            setSubmitting(false);
        }
    };


    // ... inside POAllocationPage ...

    const handleDeallocate = async (poId: number, lineItemId: number) => {
        if (!confirm('Are you sure you want to release all allocated stock from this line item?')) {
            return;
        }

        try {
            const response = await fetch(`/api/po/${poId}/deallocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineItemId }),
            });

            const result = await response.json();

            if (result.success) {
                setToast({ type: 'success', message: result.message });
                fetchPOs();
            } else {
                setToast({ type: 'error', message: result.error || 'Deallocation failed' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Deallocation failed' });
        }
    };

    const addLineItem = () => {
        setNewPO({
            ...newPO,
            lineItems: [...newPO.lineItems, { type: '', variety: '', grade: '', packing: '', qty: '' }],
        });
    };

    const removeLineItem = (index: number) => {
        if (newPO.lineItems.length > 1) {
            setNewPO({
                ...newPO,
                lineItems: newPO.lineItems.filter((_, i) => i !== index),
            });
        }
    };

    const updateLineItem = (index: number, field: string, value: string) => {
        const updated = [...newPO.lineItems];
        updated[index] = { ...updated[index], [field]: value };
        setNewPO({ ...newPO, lineItems: updated });
    };

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div></div>;
    if (!user) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Active':
                return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 shadow-sm">{status}</Badge>;
            case 'Fulfilled':
                return <Badge variant="success" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20">{status}</Badge>;
            case 'Dispatched':
                return <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20">{status}</Badge>;
            case 'Cancelled':
                return <Badge variant="destructive">{status}</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header */}
            <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <ArrowLeft size={20} />
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <ClipboardList className="text-indigo-500 h-5 w-5" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">PO Allocation</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end hidden md:flex">
                            <span className="text-sm font-medium">{user.name}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">{user.role}</Badge>
                        </div>
                        <Button onClick={handleLogout} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                            <LogOut size={16} className="mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-6 py-8">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Actions Bar */}
                    <Card className="border-border/50 bg-card/40">
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Status Filter</label>
                                    <Select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="w-48 bg-background/50"
                                    >
                                        <option value="all">All Status</option>
                                        <option value="Active">Active</option>
                                        <option value="Fulfilled">Fulfilled</option>
                                        <option value="Dispatched">Dispatched</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </Select>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={fetchPOs} variant="outline" className="gap-2">
                                        <RefreshCw size={16} />
                                        Refresh
                                    </Button>
                                    <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90 gap-2">
                                        <Plus size={16} />
                                        Create PO
                                    </Button>
                                    {/* Auto-Allocate Info Note */}
                                    <div className="hidden lg:flex items-center text-xs text-muted-foreground ml-2 px-3 py-1 bg-muted/50 rounded-lg border border-border/50">
                                        <Zap size={12} className="mr-1 text-amber-500" />
                                        <span>System auto-allocates stock (FIFO)</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* PO List */}
                    {pos.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-border rounded-xl bg-muted/20">
                            <ClipboardList className="mx-auto text-muted-foreground mb-4 opacity-50" size={64} />
                            <h3 className="text-xl font-semibold mb-2">No Purchase Orders</h3>
                            <p className="text-muted-foreground mb-6">Create your first PO.</p>
                            <Button onClick={() => setShowCreateModal(true)}>
                                <Plus size={16} className="mr-2" />
                                Create PO
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {pos.map((po) => (
                                <Card key={po.id} className="border-border/50 bg-card/40 overflow-hidden transition-all duration-200">
                                    {/* PO Header Row */}
                                    <div
                                        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/10 transition-colors"
                                        onClick={() => setExpandedPO(expandedPO === po.id ? null : po.id)}
                                    >
                                        <div className={`p-1 rounded-full bg-muted/30 transition-transform duration-200 ${expandedPO === po.id ? 'rotate-90' : ''}`}>
                                            <ChevronRight size={20} className="text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 grid md:grid-cols-4 gap-4 items-center">
                                            <div className="col-span-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-semibold text-lg">{po.po_number}</span>
                                                    {getStatusBadge(po.status)}
                                                </div>
                                                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                                    <Grid size={12} />
                                                    {po.line_items.length} line item(s) • Created {po.order_date || 'N/A'}
                                                </div>
                                            </div>

                                            <div className="col-span-2 flex justify-end items-center gap-8">
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Allocation</div>
                                                    <div className="text-xl font-bold text-sky-500">{po.allocation_percentage}%</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Progress</div>
                                                    <div className="text-sm font-medium">
                                                        {po.total_allocated} / {po.total_ordered} MCs
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Line Items */}
                                    {expandedPO === po.id && (
                                        <div className="border-t border-border/40 bg-muted/10 p-4 animate-in slide-in-from-top-2">
                                            <div className="rounded-lg border border-border/40 overflow-hidden bg-background/50">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Type</TableHead>
                                                            <TableHead>Variety</TableHead>
                                                            <TableHead>Grade</TableHead>
                                                            <TableHead>Packing</TableHead>
                                                            <TableHead className="text-right">Ordered</TableHead>
                                                            <TableHead className="text-right">Allocated</TableHead>
                                                            <TableHead className="text-right">Pending</TableHead>
                                                            <TableHead className="text-right">Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {po.line_items.map((item) => (
                                                            <TableRow key={item.id}>
                                                                <TableCell>{item.type}</TableCell>
                                                                <TableCell>{item.variety}</TableCell>
                                                                <TableCell className="font-medium">{item.grade}</TableCell>
                                                                <TableCell className="text-muted-foreground">{item.packing_code}</TableCell>
                                                                <TableCell className="text-right font-medium">{item.ordered_qty}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <span className="font-bold text-emerald-600">{item.allocated_qty}</span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {item.pending_qty > 0 ? (
                                                                        <Badge variant="warning" className="border-0 bg-amber-500/10 text-amber-600">{item.pending_qty}</Badge>
                                                                    ) : (
                                                                        <div className="flex justify-end">
                                                                            <CheckCircle className="text-emerald-500" size={18} />
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex justify-end gap-2">
                                                                        {item.allocated_qty > 0 && (
                                                                            <Button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeallocate(po.id, item.id);
                                                                                }}
                                                                                size="sm"
                                                                                variant="destructive"
                                                                                className="h-8 text-xs"
                                                                                disabled={po.status === 'Dispatched' || po.status === 'Fulfilled'}
                                                                            >
                                                                                Release
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Create PO Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                    <Card className="w-full max-w-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                            <CardTitle className="text-xl">Create Purchase Order</CardTitle>
                            <Button onClick={() => setShowCreateModal(false)} variant="ghost" size="icon" className="rounded-full">
                                <X size={20} />
                            </Button>
                        </CardHeader>

                        <CardContent className="p-6 overflow-y-auto">
                            <form id="create-po-form" onSubmit={handleCreatePO} className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">PO Number *</label>
                                        <Input
                                            type="text"
                                            value={newPO.poNumber}
                                            onChange={(e) => setNewPO({ ...newPO, poNumber: e.target.value })}
                                            placeholder="PO-001"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Order Date *</label>
                                        <Input
                                            type="date"
                                            value={newPO.orderDate}
                                            onChange={(e) => setNewPO({ ...newPO, orderDate: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-base font-medium flex items-center gap-2">
                                            <Package size={18} />
                                            Line Items
                                        </label>
                                        <Button type="button" onClick={addLineItem} variant="secondary" size="sm" className="gap-2">
                                            <Plus size={14} />
                                            Add Item
                                        </Button>
                                    </div>

                                    <div className="space-y-3">
                                        {newPO.lineItems.map((item, index) => (
                                            <div key={index} className="flex gap-3 items-end p-4 bg-muted/30 border border-border/50 rounded-xl relative group">
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                                                    <Select
                                                        value={item.type}
                                                        onChange={(e) => updateLineItem(index, 'type', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select...</option>
                                                        {masterData?.types.map((t) => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">Variety</label>
                                                    <Select
                                                        value={item.variety}
                                                        onChange={(e) => updateLineItem(index, 'variety', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select...</option>
                                                        {masterData?.varieties.map((v) => (
                                                            <option key={v} value={v}>{v}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">Grade</label>
                                                    <Select
                                                        value={item.grade}
                                                        onChange={(e) => updateLineItem(index, 'grade', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select...</option>
                                                        {masterData?.grades.map((g) => (
                                                            <option key={g} value={g}>{g}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">Packing</label>
                                                    <Select
                                                        value={item.packing}
                                                        onChange={(e) => updateLineItem(index, 'packing', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select...</option>
                                                        {masterData?.packings.map((p) => (
                                                            <option key={p} value={p}>{p}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div className="w-24 space-y-1.5">
                                                    <label className="text-xs font-medium text-muted-foreground">Qty</label>
                                                    <Input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => updateLineItem(index, 'qty', e.target.value)}
                                                        min="1"
                                                        required
                                                        className="text-center"
                                                    />
                                                </div>
                                                {newPO.lineItems.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        onClick={() => removeLineItem(index)}
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-muted-foreground hover:text-destructive h-10 w-10"
                                                    >
                                                        <X size={18} />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                        <div className="p-6 border-t border-border/40 flex justify-end gap-3 mt-auto bg-muted/10">
                            <Button type="button" onClick={() => setShowCreateModal(false)} variant="secondary">
                                Cancel
                            </Button>
                            <Button type="submit" form="create-po-form" disabled={submitting} className="bg-primary hover:bg-primary/90">
                                {submitting ? 'Creating...' : 'Create PO'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}



            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {toast.message}
                </div>
            )}
        </div>
    );
}
