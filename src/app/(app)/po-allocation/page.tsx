'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    ClipboardList,
    Plus,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    Package,
    CheckCircle,
    XCircle,
    AlertCircle,
    X,
    Grid,
    Search,
    Truck,
    Tag,
    Upload,
    Layers,
    MapPin,
    BarChart3,
    Trash2,
    Store,
    ShoppingBag,
    QrCode
} from 'lucide-react';
import type { POWithLineItems, POLineItemWithDetails, UserPublic } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDisplayDate } from '@/lib/utils';

interface MasterData {
    grades: string[];
    varieties: string[];
    packings: string[];
    types: string[];
    coldStores: string[];
}

interface AllocationStore {
    store: string;
    qty: number;
}

interface BarcodeInfo {
    total: number;
    unused: number;
    assigned: number;
    featureEnabled: boolean;
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
    const [loadingStores, setLoadingStores] = useState<string[]>([]);

    // Create PO form state
    const [newPO, setNewPO] = useState({
        poNumber: '',
        orderDate: new Date().toISOString().split('T')[0],
        brandingType: 'Demo' as 'Demo' | 'Branded',
        loadingStore: '',
        lineItems: [{ type: '', variety: '', grade: '', packing: '', qty: '' }],
    });

    // Store-specific allocation modal
    const [showAllocModal, setShowAllocModal] = useState(false);
    const [allocTargetPO, setAllocTargetPO] = useState<POWithLineItems | null>(null);
    const [allocTargetLineItemId, setAllocTargetLineItemId] = useState<number | null>(null);
    const [allocStore, setAllocStore] = useState('');
    const [allocQty, setAllocQty] = useState('');
    const [allocSubmitting, setAllocSubmitting] = useState(false);

    // Customer barcode upload modal
    const [showBarcodeModal, setShowBarcodeModal] = useState(false);
    const [barcodePO, setBarcodePO] = useState<POWithLineItems | null>(null);
    const [barcodeInput, setBarcodeInput] = useState('');
    const [barcodeInfo, setBarcodeInfo] = useState<BarcodeInfo | null>(null);
    const [barcodeSubmitting, setBarcodeSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Check authentication
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await fetch('/api/auth/me');
                const result = await response.json();

                if (result.success) {
                    setUser(result.user);
                    // Role-based access: marketing, store manager, admin, GM can access
                    const allowedRoles = ['admin', 'general_manager', 'marketing_manager', 'store_manager'];
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
            fetchLoadingStores();
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

    // Fetch stores that have loading facility (for PO assignment)
    const fetchLoadingStores = async () => {
        try {
            const response = await fetch('/api/master-data');
            const result = await response.json();
            if (result.success) {
                // For now use all cold stores — in future filter by has_loading_facility
                setLoadingStores(result.data.coldStores || []);
            }
        } catch (error) {
            console.error('Failed to fetch loading stores:', error);
        }
    };

    const handleCreatePO = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const payload = {
                poNumber: newPO.poNumber,
                orderDate: newPO.orderDate,
                brandingType: newPO.brandingType,
                loadingStore: newPO.loadingStore || undefined,
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
                    brandingType: 'Demo',
                    loadingStore: '',
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

    // ---- Store-specific allocation ----
    const openAllocModal = (po: POWithLineItems, lineItemId: number) => {
        setAllocTargetPO(po);
        setAllocTargetLineItemId(lineItemId);
        setAllocStore('');
        setAllocQty('');
        setShowAllocModal(true);
    };

    const handleAllocate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!allocTargetPO || !allocTargetLineItemId) return;
        setAllocSubmitting(true);

        try {
            const response = await fetch(`/api/po/${allocTargetPO.id}/allocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lineItemId: allocTargetLineItemId,
                    qty: parseInt(allocQty, 10),
                    coldStore: allocStore,
                }),
            });

            const result = await response.json();

            if (result.success) {
                setToast({ type: 'success', message: result.message });
                setShowAllocModal(false);
                fetchPOs();
            } else {
                setToast({ type: 'error', message: result.error || 'Allocation failed' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Allocation failed' });
        } finally {
            setAllocSubmitting(false);
        }
    };

    // ---- Customer barcode upload ----
    const openBarcodeModal = async (po: POWithLineItems) => {
        setBarcodePO(po);
        setBarcodeInput('');
        setBarcodeInfo(null);
        setShowBarcodeModal(true);
        await fetchBarcodeInfo(po.id);
    };

    const fetchBarcodeInfo = async (poId: number) => {
        try {
            const res = await fetch(`/api/po/${poId}/barcodes`);
            const result = await res.json();
            if (result.success) {
                setBarcodeInfo({
                    total: result.summary.total,
                    unused: result.summary.unused,
                    assigned: result.summary.assigned,
                    featureEnabled: result.featureEnabled,
                });
            }
        } catch (error) {
            console.error('Failed to fetch barcode info:', error);
        }
    };

    const handleBarcodeUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcodePO || !barcodeInput.trim()) return;
        setBarcodeSubmitting(true);

        try {
            // Parse barcodes - support newline and comma separated
            const barcodes = barcodeInput
                .split(/[\n,]+/)
                .map(b => b.trim())
                .filter(b => b.length > 0);

            const response = await fetch(`/api/po/${barcodePO.id}/barcodes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcodes }),
            });

            const result = await response.json();

            if (result.success) {
                setToast({ type: 'success', message: result.message });
                setBarcodeInput('');
                await fetchBarcodeInfo(barcodePO.id);
            } else {
                setToast({ type: 'error', message: result.error || 'Upload failed' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Upload failed' });
        } finally {
            setBarcodeSubmitting(false);
        }
    };

    const handleClearBarcodes = async () => {
        if (!barcodePO) return;
        if (!confirm('Clear all unused barcodes for this PO?')) return;

        try {
            const response = await fetch(`/api/po/${barcodePO.id}/barcodes`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                setToast({ type: 'success', message: result.message });
                await fetchBarcodeInfo(barcodePO.id);
            } else {
                setToast({ type: 'error', message: result.error || 'Failed to clear barcodes' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Failed to clear barcodes' });
        }
    };

    // Handle CSV/TXT file upload for barcodes
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setBarcodeInput(prev => prev ? prev + '\n' + text : text);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Line item helpers
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

    const canCreatePO = ['admin', 'general_manager', 'marketing_manager'].includes(user.role);
    const canAllocate = ['admin', 'general_manager', 'store_manager'].includes(user.role);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Active':
                return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">{status}</Badge>;
            case 'Fulfilled':
                return <Badge variant="success" className="bg-emerald-600 hover:bg-emerald-700 text-white">{status}</Badge>;
            case 'Dispatched':
                return <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white">{status}</Badge>;
            case 'Cancelled':
                return <Badge variant="destructive">{status}</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const getBrandingBadge = (brandingType?: string | null) => {
        if (brandingType === 'Branded') {
            return (
                <Badge className="bg-violet-600/15 text-violet-700 border border-violet-500/30 gap-1 text-xs font-medium">
                    <Tag size={10} />
                    Branded
                </Badge>
            );
        }
        return (
            <Badge className="bg-sky-500/10 text-sky-700 border border-sky-500/25 gap-1 text-xs font-medium">
                <ShoppingBag size={10} />
                Demo
            </Badge>
        );
    };

    return (
        <div className="p-6 space-y-6">
            {/* Page Title */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">PO Allocation</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage purchase orders and stock allocation</p>
                </div>
            </div>

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
                                {canCreatePO && (
                                    <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90 gap-2">
                                        <Plus size={16} />
                                        Create PO
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* PO List */}
                {pos.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-border rounded-xl bg-muted/20">
                        <ClipboardList className="mx-auto text-muted-foreground mb-4 opacity-50" size={64} />
                        <h3 className="text-xl font-semibold mb-2">No Purchase Orders</h3>
                        <p className="text-muted-foreground mb-6">Create your first PO to get started.</p>
                        {canCreatePO && (
                            <Button onClick={() => setShowCreateModal(true)}>
                                <Plus size={16} className="mr-2" />
                                Create PO
                            </Button>
                        )}
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
                                    <div className="flex-1 grid md:grid-cols-5 gap-4 items-center">
                                        <div className="col-span-2">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="font-semibold text-lg">{po.po_number}</span>
                                                {getStatusBadge(po.status)}
                                                {getBrandingBadge((po as any).branding_type)}
                                            </div>
                                            <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1.5 flex-wrap">
                                                <span className="flex items-center gap-1"><Grid size={12} /> {po.line_items.length} line item(s)</span>
                                                {(po as any).loading_store && (
                                                    <span className="flex items-center gap-1"><Store size={12} /> {(po as any).loading_store}</span>
                                                )}
                                                <span>{formatDisplayDate(po.order_date)}</span>
                                            </div>
                                        </div>

                                        <div className="col-span-3 flex justify-end items-center gap-6 flex-wrap">
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
                                            {/* Barcode Upload button for Branded POs */}
                                            {(po as any).branding_type === 'Branded' && po.status !== 'Dispatched' && canAllocate && (
                                                <Button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openBarcodeModal(po);
                                                    }}
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs gap-1.5 border-violet-500/40 text-violet-700 hover:bg-violet-50"
                                                >
                                                    <QrCode size={13} />
                                                    Barcodes
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Line Items */}
                                {expandedPO === po.id && (
                                    <div className="border-t border-border/40 bg-muted/10 p-4 animate-in slide-in-from-top-2">
                                        {/* Desktop Table View */}
                                        <div className="hidden md:block rounded-lg border border-border/40 overflow-hidden bg-background/50">
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
                                                                    {/* Allocate button for store managers */}
                                                                    {canAllocate && item.pending_qty > 0 && po.status === 'Active' && (
                                                                        <Button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openAllocModal(po, item.id);
                                                                            }}
                                                                            size="sm"
                                                                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1"
                                                                        >
                                                                            <Layers size={12} />
                                                                            Allocate
                                                                        </Button>
                                                                    )}
                                                                    {item.allocated_qty > 0 && (
                                                                        <Button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleDeallocate(po.id, item.id);
                                                                            }}
                                                                            size="sm"
                                                                            variant="destructive"
                                                                            className="h-8 text-xs"
                                                                            disabled={po.status === 'Dispatched'}
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

                                        {/* Mobile Cards View */}
                                        <div className="md:hidden space-y-3">
                                            {po.line_items.map((item) => (
                                                <div key={item.id} className="p-4 bg-background border border-border/50 rounded-xl space-y-3 shadow-sm">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <Badge variant="secondary" className="font-normal">{item.type}</Badge>
                                                        <span className="text-muted-foreground font-mono">{item.packing_code}</span>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-foreground">{item.variety}</div>
                                                        <div className="text-xs text-muted-foreground font-medium mt-0.5">Grade: {item.grade}</div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-center pt-2.5 border-t border-border/40 text-xs">
                                                        <div>
                                                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Ordered</span>
                                                            <span className="font-semibold text-foreground">{item.ordered_qty}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Allocated</span>
                                                            <span className="font-bold text-emerald-600">{item.allocated_qty}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Pending</span>
                                                            {item.pending_qty > 0 ? (
                                                                <span className="font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">{item.pending_qty}</span>
                                                            ) : (
                                                                <span className="font-bold text-emerald-500">0</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="pt-2 border-t border-border/40 flex gap-2">
                                                        {canAllocate && item.pending_qty > 0 && po.status === 'Active' && (
                                                            <Button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openAllocModal(po, item.id);
                                                                }}
                                                                size="sm"
                                                                className="flex-1 h-9 text-xs bg-emerald-600 hover:bg-emerald-700"
                                                            >
                                                                Allocate Stock
                                                            </Button>
                                                        )}
                                                        {item.allocated_qty > 0 && (
                                                            <Button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeallocate(po.id, item.id);
                                                                }}
                                                                size="sm"
                                                                variant="destructive"
                                                                className="flex-1 h-9 text-xs"
                                                                disabled={po.status === 'Dispatched'}
                                                            >
                                                                Release
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </div>

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
                                {/* PO Number & Date */}
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

                                {/* PO Type & Loading Store */}
                                <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 border border-border/40 rounded-xl">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Tag size={14} />
                                            PO Type *
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['Demo', 'Branded'] as const).map((type) => (
                                                <label
                                                    key={type}
                                                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all duration-200 text-sm font-medium ${newPO.brandingType === type
                                                        ? type === 'Branded'
                                                            ? 'bg-violet-600/10 border-violet-500 text-violet-700'
                                                            : 'bg-sky-500/10 border-sky-500 text-sky-700'
                                                        : 'bg-background border-border/50 hover:border-border text-muted-foreground'
                                                        }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="brandingType"
                                                        value={type}
                                                        checked={newPO.brandingType === type}
                                                        onChange={() => setNewPO({ ...newPO, brandingType: type })}
                                                        className="sr-only"
                                                    />
                                                    {type === 'Branded' ? <Tag size={14} /> : <ShoppingBag size={14} />}
                                                    {type}
                                                </label>
                                            ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {newPO.brandingType === 'Branded'
                                                ? '⚠️ Branded POs require repacking before dispatch'
                                                : '✓ Demo POs can be directly dispatched'}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Store size={14} />
                                            Loading Store
                                        </label>
                                        <Select
                                            value={newPO.loadingStore}
                                            onChange={(e) => setNewPO({ ...newPO, loadingStore: e.target.value })}
                                        >
                                            <option value="">Select loading store...</option>
                                            {loadingStores.map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Store where goods will be loaded for dispatch</p>
                                    </div>
                                </div>

                                {/* Line Items */}
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
                                            <div key={index} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end p-4 bg-muted/30 border border-border/50 rounded-xl relative group">
                                                <div className="col-span-1 space-y-1.5 w-full">
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
                                                <div className="col-span-1 space-y-1.5 w-full">
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
                                                <div className="col-span-1 space-y-1.5 w-full">
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
                                                <div className="col-span-1 space-y-1.5 w-full">
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
                                                <div className="col-span-2 md:col-span-1 flex gap-2 items-end w-full">
                                                    <div className="flex-1 space-y-1.5">
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
                                                            className="text-muted-foreground hover:text-destructive h-10 w-10 shrink-0"
                                                        >
                                                            <X size={18} />
                                                        </Button>
                                                    )}
                                                </div>
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

            {/* Store-Specific Allocation Modal */}
            {showAllocModal && allocTargetPO && allocTargetLineItemId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAllocModal(false)}>
                    <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                            <div>
                                <CardTitle className="text-lg">Allocate Stock</CardTitle>
                                <CardDescription className="mt-1">
                                    PO: <span className="font-semibold text-foreground">{allocTargetPO.po_number}</span>
                                    {' '} · {(() => {
                                        const item = allocTargetPO.line_items.find(i => i.id === allocTargetLineItemId);
                                        return item ? `${item.variety} ${item.grade} - Pending: ${item.pending_qty} MCs` : '';
                                    })()}
                                </CardDescription>
                            </div>
                            <Button onClick={() => setShowAllocModal(false)} variant="ghost" size="icon" className="rounded-full">
                                <X size={20} />
                            </Button>
                        </CardHeader>

                        <CardContent className="p-6">
                            <form id="alloc-form" onSubmit={handleAllocate} className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <Store size={14} />
                                        Source Store *
                                    </label>
                                    <Select
                                        value={allocStore}
                                        onChange={(e) => setAllocStore(e.target.value)}
                                        required
                                    >
                                        <option value="">Select store...</option>
                                        {masterData?.coldStores.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </Select>
                                    <p className="text-xs text-muted-foreground">System will allocate FIFO from the selected store</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Quantity (MCs) *</label>
                                    <Input
                                        type="number"
                                        value={allocQty}
                                        onChange={(e) => setAllocQty(e.target.value)}
                                        min="1"
                                        max={allocTargetPO.line_items.find(i => i.id === allocTargetLineItemId)?.pending_qty || undefined}
                                        placeholder="Enter qty..."
                                        required
                                    />
                                </div>

                                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-700">
                                    <strong>Note:</strong> Cartons will be marked as <code className="bg-amber-100/50 px-1 rounded">Reserved</code> for this PO. For Branded POs, repacking is required before dispatch.
                                </div>
                            </form>
                        </CardContent>
                        <div className="p-6 border-t border-border/40 flex justify-end gap-3 bg-muted/10">
                            <Button type="button" onClick={() => setShowAllocModal(false)} variant="secondary">
                                Cancel
                            </Button>
                            <Button type="submit" form="alloc-form" disabled={allocSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
                                {allocSubmitting ? 'Allocating...' : 'Allocate Stock'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Customer Barcode Upload Modal */}
            {showBarcodeModal && barcodePO && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowBarcodeModal(false)}>
                    <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <QrCode size={20} className="text-violet-600" />
                                    Customer Barcodes
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    PO: <span className="font-semibold text-foreground">{barcodePO.po_number}</span>
                                </CardDescription>
                            </div>
                            <Button onClick={() => setShowBarcodeModal(false)} variant="ghost" size="icon" className="rounded-full">
                                <X size={20} />
                            </Button>
                        </CardHeader>

                        <CardContent className="p-6 space-y-5">
                            {/* Status summary */}
                            {barcodeInfo && (
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                                        <div className="text-2xl font-bold">{barcodeInfo.total}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">Total</div>
                                    </div>
                                    <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                                        <div className="text-2xl font-bold text-amber-600">{barcodeInfo.unused}</div>
                                        <div className="text-xs text-amber-700 mt-0.5">Unused</div>
                                    </div>
                                    <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                                        <div className="text-2xl font-bold text-emerald-600">{barcodeInfo.assigned}</div>
                                        <div className="text-xs text-emerald-700 mt-0.5">Assigned</div>
                                    </div>
                                </div>
                            )}

                            {!barcodeInfo?.featureEnabled && (
                                <div className="p-3 bg-muted/40 border border-border/50 rounded-lg text-sm text-muted-foreground">
                                    ⚙️ Customer barcode feature is currently disabled in System Settings. Barcodes uploaded here will be stored but not auto-assigned during repacking.
                                </div>
                            )}

                            {/* Upload form */}
                            <form id="barcode-form" onSubmit={handleBarcodeUpload} className="space-y-3">
                                <label className="text-sm font-medium">Enter Barcodes (one per line or comma-separated)</label>
                                <textarea
                                    value={barcodeInput}
                                    onChange={(e) => setBarcodeInput(e.target.value)}
                                    placeholder="BC001&#10;BC002&#10;BC003"
                                    className="w-full min-h-[120px] px-3 py-2 text-sm bg-background border border-border rounded-lg resize-y font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-xs"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Upload size={13} />
                                        Import CSV/TXT
                                    </Button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv,.txt"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                    <span className="text-xs text-muted-foreground">or paste barcodes above</span>
                                </div>
                            </form>
                        </CardContent>
                        <div className="p-6 border-t border-border/40 flex justify-between gap-3 bg-muted/10">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive border-destructive/40 hover:bg-destructive/10 gap-1.5"
                                onClick={handleClearBarcodes}
                                disabled={!barcodeInfo || barcodeInfo.unused === 0}
                            >
                                <Trash2 size={14} />
                                Clear Unused
                            </Button>
                            <div className="flex gap-2">
                                <Button type="button" onClick={() => setShowBarcodeModal(false)} variant="secondary">
                                    Close
                                </Button>
                                <Button
                                    type="submit"
                                    form="barcode-form"
                                    disabled={barcodeSubmitting || !barcodeInput.trim()}
                                    className="bg-violet-600 hover:bg-violet-700 gap-1.5"
                                >
                                    <Upload size={15} />
                                    {barcodeSubmitting ? 'Uploading...' : 'Upload Barcodes'}
                                </Button>
                            </div>
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
