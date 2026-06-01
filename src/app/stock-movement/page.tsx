'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Package,
    ArrowLeft,
    Plus,
    RefreshCw,
    LogOut,
    ArrowRightLeft,
    ArrowDownToLine,
    ArrowUpFromLine,
    X,
    AlertCircle,
    CheckCircle,
    Clock,
    Check,
    Ban,
    ScanBarcode,
    Trash,
    Search,
    Filter,
    Truck,
    ArrowRight,
    ArrowUpRight,
    Pencil,
    Printer,
    Download,
    History,
    Layers,
    Scissors
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { StockSummary, UserPublic } from '@/types';
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

type MovementType = 'INWARD' | 'TRANSFER' | 'DISPATCH' | 'REPACK_OUT' | 'REPACK_IN';

export default function StockMovementPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserPublic | null>(null);
    const [loading, setLoading] = useState(true);
    const [stockSummary, setStockSummary] = useState<StockSummary[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [masterData, setMasterData] = useState<MasterData | null>(null);
    const [settings, setSettings] = useState<{ [key: string]: string }>({});
    const [inRepackingStock, setInRepackingStock] = useState<any[]>([]);

    // UI State
    const [showModal, setShowModal] = useState(false);
    const [movementType, setMovementType] = useState<MovementType>('INWARD');
    // Edit Mode State
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [view, setView] = useState<'operations' | 'reports'>('operations');

    // Dispatch Specific State
    const [activePOs, setActivePOs] = useState<any[]>([]);
    const [dispatchPurpose, setDispatchPurpose] = useState<'SALE' | 'REPACKING'>('SALE');
    const [selectedPO, setSelectedPO] = useState<string>('');
    const [poLineItems, setPoLineItems] = useState<any[]>([]);
    const [selectedLineItem, setSelectedLineItem] = useState<string>('');

    // Scanning State
    const [isScanMode, setIsScanMode] = useState(false);
    const [scannedMCs, setScannedMCs] = useState<string[]>([]);
    const [barcodeInput, setBarcodeInput] = useState('');
    const barcodeInputRef = useRef<HTMLInputElement>(null);

    // Filter State
    const [filters, setFilters] = useState({
        fromDate: '',
        toDate: '',
        actionType: 'ALL',
        variety: 'ALL',
        status: 'ALL'
    });
    const [formData, setFormData] = useState({
        fromStore: '',
        toStore: '',
        type: '',
        variety: '',
        packing: '',
        grade: '',
        qty: '',
        remarks: '',
    });

    // Helper: Determine permissions
    const isGlobalUser = user?.role === 'admin' || user?.role === 'general_manager';
    // Stores the user is allowed to manage (Source for Transfer/Return, Dest for Inward)
    const myStores = isGlobalUser
        ? (masterData?.coldStores || [])
        : (user?.assigned_store_names || []);

    // Stores the user can ship TO (Transfer destination) - Always Global
    const allStores = masterData?.coldStores || [];

    // Auto-select store if only one option available in "My Stores"
    useEffect(() => {
        if (!isGlobalUser && myStores.length === 1 && showModal) {
            setFormData(prev => ({
                ...prev,
                // For Outward/Transfer, Source is fixed to my store
                fromStore: (movementType === 'TRANSFER' || movementType === 'DISPATCH') ? myStores[0] : prev.fromStore,
                // For Inward, Destination is fixed to my store
                toStore: (movementType === 'INWARD') ? myStores[0] : prev.toStore
            }));
        }
    }, [isGlobalUser, myStores, showModal, movementType]);

    // Check authentication
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await fetch('/api/auth/me');
                const result = await response.json();

                if (result.success) {
                    setUser(result.user);
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
            refreshAllData();
        }
    }, [user]);

    const refreshAllData = () => {
        fetchStockSummary();
        fetchPendingRequests();
        fetchHistory();
        fetchMasterData();
        fetchHistory();
        fetchMasterData();
        fetchSettings();
        fetchActivePOs();
        fetchInRepackingStock();
    };

    const fetchStockSummary = async () => {
        try {
            const response = await fetch('/api/stock');
            const result = await response.json();
            if (result.success) setStockSummary(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchPendingRequests = async () => {
        try {
            const response = await fetch('/api/movement/pending');
            const result = await response.json();
            if (result.success) setPendingRequests(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchHistory = async () => {
        try {
            const params = new URLSearchParams();
            params.set('limit', '20');
            if (filters.fromDate) params.set('fromDate', filters.fromDate);
            if (filters.toDate) params.set('toDate', filters.toDate);
            if (filters.actionType !== 'ALL') params.set('actionType', filters.actionType);
            if (filters.variety !== 'ALL') params.set('variety', filters.variety);
            if (filters.status !== 'ALL') params.set('status', filters.status);

            const response = await fetch(`/api/movement?${params.toString()}`);
            const result = await response.json();
            if (result.success) setHistory(result.data);
        } catch (error) { console.error(error); }
    };

    // Refetch history when filters change
    useEffect(() => {
        if (user) {
            fetchHistory();
        }
    }, [filters]);

    const fetchMasterData = async () => {
        try {
            const response = await fetch('/api/master-data');
            const result = await response.json();
            if (result.success) setMasterData(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchSettings = async () => {
        try {
            const response = await fetch('/api/admin/settings');
            const result = await response.json();
            if (result.success) setSettings(result.data);
        } catch (error) { console.error(error); }
    }

    const fetchActivePOs = async () => {
        try {
            const response = await fetch('/api/po/active');
            const result = await response.json();
            if (result.success) setActivePOs(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchInRepackingStock = async () => {
        try {
            const response = await fetch('/api/stock?status=In Repacking');
            const result = await response.json();
            if (result.success) setInRepackingStock(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchPOLineItems = async (poId: string) => {
        try {
            const response = await fetch(`/api/po/items?poId=${poId}`);
            const result = await response.json();
            if (result.success) setPoLineItems(result.data);
        } catch (error) { console.error(error); }
    };

    const handlePOChange = async (poId: string) => {
        setSelectedPO(poId);
        setSelectedLineItem('');
        setPoLineItems([]);
        if (poId) {
            await fetchPOLineItems(poId);
            const po = activePOs.find(p => p.id.toString() === poId);
            if (po && po.customer && movementType === 'DISPATCH') {
                setFormData(prev => ({ ...prev, toStore: po.customer }));
            }
        }
    };

    const fetchAllocatedStock = async (poId: number, lineItemId: number) => {
        try {
            // We need a way to fetch stock by PO and Line Item
            const response = await fetch(`/api/stock/allocated?poId=${poId}&lineItemId=${lineItemId}`);
            const result = await response.json();
            if (result.success) {
                const mcNumbers = result.data.map((s: any) => s.mc_number);
                setScannedMCs(mcNumbers);
                setIsScanMode(true);
                setFormData(prev => ({ ...prev, qty: mcNumbers.length.toString() }));
            }
        } catch (error) { console.error(error); }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (error) { console.error(error); }
    };

    const resetForm = (type: MovementType) => {
        // Reset to empty
        setFormData({
            fromStore: '',
            toStore: '',
            type: '',
            variety: '',
            packing: '',
            grade: '',
            qty: '',
            remarks: '',
        });

        setScannedMCs([]);
        setIsScanMode(false);
        setBarcodeInput('');
        setIsEditMode(false);
        setEditingRequestId(null);
    };

    const openModal = (type: MovementType) => {
        setMovementType(type);
        setDispatchPurpose('SALE');
        setSelectedPO('');
        resetForm(type);
        setShowModal(true);
    };

    const handleEdit = (req: any) => {
        setMovementType(req.action_type);
        setEditingRequestId(req.movement_id);
        setIsEditMode(true);

        setFormData({
            fromStore: req.from_location || '',
            toStore: req.to_location || '',
            type: req.type || '',
            variety: req.variety || '',
            packing: req.packing || '',
            grade: req.grade || '',
            qty: req.qty_mcs?.toString() || '',
            remarks: req.remarks || '',
        });

        setShowModal(true);
    };

    const handleBarcodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcodeInput.trim()) return;

        // Prevent duplicates
        if (scannedMCs.includes(barcodeInput.trim())) {
            alert('This MC is already scanned');
            setBarcodeInput('');
            return;
        }

        setScannedMCs([...scannedMCs, barcodeInput.trim()]);
        setBarcodeInput('');
        // Sync qty with scanned count
        setFormData(prev => ({ ...prev, qty: (scannedMCs.length + 1).toString() }));
    }

    const removeScannedMC = (mc: string) => {
        const newList = scannedMCs.filter(m => m !== mc);
        setScannedMCs(newList);
        setFormData(prev => ({ ...prev, qty: newList.length.toString() }));
    }

    const handlePrintReceipt = (id: string) => {
        window.open(`/stock-movement/receipt/${id}`, '_blank');
    };

    const handleExport = () => {
        if (!history.length) return;

        const data = history.map(item => ({
            'Date': new Date(item.movement_datetime).toLocaleString(),
            'Type': item.action_type,
            'From': item.from_location || '-',
            'To': item.to_location,
            'Variety': item.variety,
            'Grade': item.grade,
            'Packing': item.packing,
            'Qty (MCs)': item.qty_mcs,
            'Status': item.status,
            'Moved By': item.moved_by_name,
            'Approved By': item.approved_by_name || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock Movement");
        XLSX.writeFile(wb, `Stock_Movement_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const payload = {
                actionType: movementType,
                ...formData,
                qty: parseInt(formData.qty, 10),
                specificMCNumbers: (isScanMode && movementType !== 'INWARD') ? scannedMCs : undefined,
                barcodes: (isScanMode && movementType === 'INWARD') ? scannedMCs : undefined,
                dispatchPurpose: movementType === 'DISPATCH' ? dispatchPurpose : undefined,
                poId: (movementType === 'DISPATCH' && dispatchPurpose === 'SALE' && selectedPO) ? parseInt(selectedPO) : undefined,
                // Repacking specifics
                originalMcNumbers: movementType === 'REPACK_IN' ? (formData as any).originalMcNumbers : undefined,
                items: movementType === 'REPACK_IN' ? scannedMCs.map(mc => ({ mcNumber: mc })) : undefined,
                mcNumbers: movementType === 'REPACK_OUT' ? scannedMCs : undefined,
                newPacking: movementType === 'REPACK_IN' ? formData.packing : undefined,
            };

            let response;
            if (isEditMode && editingRequestId) {
                // UPDATE existing request
                response = await fetch(`/api/movement/${editingRequestId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                // CREATE new request
                response = await fetch('/api/movement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }


            const result = await response.json();

            if (result.success) {
                const message = user?.role === 'operator'
                    ? 'Request submitted for approval!'
                    : `${movementType} successful!`;

                setToast({ type: 'success', message });
                setShowModal(false);
                resetForm(movementType);
                refreshAllData();
            } else {
                setToast({ type: 'error', message: result.error || 'Movement failed' });
            }
        } catch (error) {
            setToast({ type: 'error', message: 'Failed to process movement' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async (id: string) => {
        if (!confirm('Are you sure you want to approve this movement?')) return;
        try {
            const res = await fetch(`/api/movement/${id}/approve`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                setToast({ type: 'success', message: 'Detailed approved & stock updated' });
                refreshAllData();
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Approval failed' });
        }
    };

    const handleReject = async (id: string) => {
        if (!confirm('Reject this request?')) return;
        try {
            const res = await fetch(`/api/movement/${id}/reject`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                setToast({ type: 'success', message: 'Request rejected' });
                refreshAllData();
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Rejection failed' });
        }
    };

    const handleAccept = async (id: string) => {
        if (!confirm('Confirm receipt of this stock?')) return;
        try {
            const res = await fetch(`/api/movement/${id}/accept`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                setToast({ type: 'success', message: 'Transfer accepted & stock added' });
                refreshAllData();
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Acceptance failed' });
        }
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
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Package className="text-blue-500 h-5 w-5" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">Stock Movement</span>
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
                    {/* Action Buttons */}
                    <Card className="border-border/50 bg-card/40">
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold">Movement Operations</h2>
                                    <p className="text-sm text-muted-foreground">Manage inventory inward, transfer, and return.</p>
                                </div>
                                <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                                    <Button onClick={() => openModal('INWARD')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1 sm:flex-none">
                                        <ArrowDownToLine size={18} /> Inward
                                    </Button>
                                    <Button onClick={() => openModal('TRANSFER')} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 flex-1 sm:flex-none">
                                        <ArrowRightLeft size={18} /> Transfer
                                    </Button>
                                    <Button onClick={() => openModal('DISPATCH')} variant="secondary" className="gap-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200 flex-1 sm:flex-none">
                                        <Truck size={18} /> Dispatch
                                    </Button>
                                    <Button onClick={() => openModal('REPACK_OUT')} variant="outline" className="gap-2 border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 flex-1 sm:flex-none">
                                        <Scissors size={18} /> Repack Out
                                    </Button>
                                    <Button onClick={() => openModal('REPACK_IN')} variant="outline" className="gap-2 border-purple-200 bg-purple-50/50 text-purple-700 hover:bg-purple-100 flex-1 sm:flex-none">
                                        <Layers size={18} /> Repack In
                                    </Button>
                                    <Button onClick={handleExport} variant="outline" className="gap-2 flex-1 sm:flex-none" title="Export to Excel">
                                        <Download size={16} /> Export
                                    </Button>
                                    <Button onClick={refreshAllData} variant="outline" size="icon" className="shrink-0">
                                        <RefreshCw size={16} />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pending Approvals Section */}
                    {pendingRequests.length > 0 && (
                        <Card className="border-l-4 border-l-amber-500 bg-amber-500/5 border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2 text-amber-600">
                                    <Clock size={20} />
                                    Pending Approvals
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border border-border/50 bg-background/50 overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Time</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Details</TableHead>
                                                <TableHead>Qty</TableHead>
                                                <TableHead>Requested By</TableHead>
                                                {(user.role === 'admin' || user.role === 'manager') && (
                                                    <TableHead className="text-right">Actions</TableHead>
                                                )}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pendingRequests.map((req) => (
                                                <TableRow key={req.id}>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {new Date(req.movement_datetime).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={req.status === 'In Transit' ? 'secondary' : (req.action_type === 'INWARD' ? 'success' : req.action_type === 'TRANSFER' ? 'info' : req.action_type === 'REPACK_OUT' ? 'warning' : 'info')}>
                                                            {req.status === 'In Transit' ? 'In Transit' : req.action_type.replace('_', ' ')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{req.variety} <span className="text-muted-foreground font-normal">({req.grade})</span></div>
                                                        <div className="text-xs text-muted-foreground">{req.packing}</div>
                                                        <div className="text-xs mt-1 font-mono">
                                                            {req.from_location ? `${req.from_location} → ` : ''}
                                                            {req.to_location}
                                                        </div>
                                                        {/* Show note if barcodes present (can't see detailed list here without query change, but acceptable for now) */}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">{req.qty_mcs} MCs</TableCell>
                                                    <TableCell className="text-sm">{req.moved_by_name}</TableCell>
                                                    {(user.role === 'admin' || user.role === 'manager') && (
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                {req.status === 'In Transit' ? (
                                                                    <Button
                                                                        onClick={() => handleAccept(req.movement_id)}
                                                                        size="sm"
                                                                        className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center gap-1"
                                                                        title="Accept Transfer"
                                                                    >
                                                                        <CheckCircle size={14} /> Accept
                                                                    </Button>
                                                                ) : (
                                                                    <>
                                                                        <Button
                                                                            onClick={() => handleEdit(req)}
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                                            title="Edit Request"
                                                                        >
                                                                            <Pencil size={14} />
                                                                        </Button>
                                                                        <Button
                                                                            onClick={() => handleApprove(req.movement_id)}
                                                                            size="sm"
                                                                            className="h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600 rounded-full"
                                                                            title="Approve"
                                                                        >
                                                                            <Check size={14} />
                                                                        </Button>
                                                                        <Button
                                                                            onClick={() => handleReject(req.movement_id)}
                                                                            size="sm"
                                                                            variant="destructive"
                                                                            className="h-8 w-8 p-0 rounded-full"
                                                                            title="Reject"
                                                                        >
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
                            </CardContent>
                        </Card>
                    )}

                    {/* View Switcher */}
                    <div className="flex justify-center">
                        <div className="bg-muted p-1 rounded-lg flex gap-1">
                            <Button
                                variant={view === 'operations' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setView('operations')}
                                className="px-6"
                            >
                                Operations
                            </Button>
                            <Button
                                variant={view === 'reports' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setView('reports')}
                                className="px-6"
                            >
                                Store Reports
                            </Button>
                        </div>
                    </div>

                    {view === 'operations' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Stock Position */}
                            <Card className="lg:col-span-1 border-border/50 bg-card/40 flex flex-col h-[500px]">
                                <CardHeader>
                                    <CardTitle className="text-lg">Stock Position</CardTitle>
                                    <CardDescription>Current inventory levels across stores.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-hidden p-0">
                                    {stockSummary.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Package className="h-10 w-10 mx-auto opacity-20 mb-2" />
                                            <p>No stock available</p>
                                        </div>
                                    ) : (
                                        <div className="h-full overflow-y-auto">
                                            <Table>
                                                <TableHeader className="sticky top-0 bg-card/95 backdrop-blur z-10">
                                                    <TableRow>
                                                        <TableHead className="w-[100px]">Type</TableHead>
                                                        <TableHead>Variety</TableHead>
                                                        <TableHead className="text-right">Stock</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {stockSummary.map((item, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell><Badge variant="outline" className="text-[10px]">{item.type}</Badge></TableCell>
                                                            <TableCell>
                                                                <div className="font-medium text-sm">{item.variety}</div>
                                                                <div className="text-xs text-muted-foreground">{item.coldStore}</div>
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold">{item.stock}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Recent History */}
                            <Card className="lg:col-span-2 border-border/50 bg-card/40 flex flex-col h-[500px]">
                                <CardHeader className="pb-4">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <CardTitle className="text-lg">Movement History</CardTitle>
                                            <CardDescription>Recent transaction log.</CardDescription>
                                        </div>
                                    </div>
                                    {/* Filter Toolbar */}
                                    <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-2 rounded-lg border border-border/40 mt-4">
                                        <Filter size={14} className="text-muted-foreground ml-1" />

                                        {/* Date Range */}
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="date"
                                                value={filters.fromDate}
                                                onChange={e => setFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                                                className="h-8 text-xs py-1 w-32 bg-background/50"
                                            />
                                            <span className="text-muted-foreground">-</span>
                                            <Input
                                                type="date"
                                                value={filters.toDate}
                                                onChange={e => setFilters(prev => ({ ...prev, toDate: e.target.value }))}
                                                className="h-8 text-xs py-1 w-32 bg-background/50"
                                            />
                                        </div>

                                        {/* Filters */}
                                        <Select
                                            value={filters.actionType}
                                            onChange={e => setFilters(prev => ({ ...prev, actionType: e.target.value }))}
                                            className="h-8 text-xs py-0 w-28 bg-background/50"
                                        >
                                            <option value="ALL">All Types</option>
                                            <option value="INWARD">Inward</option>
                                            <option value="TRANSFER">Transfer</option>
                                            <option value="DISPATCH">Dispatch</option>
                                            <option value="REPACK_OUT">Repack Out</option>
                                            <option value="REPACK_IN">Repack In</option>
                                        </Select>

                                        <Select
                                            value={filters.variety}
                                            onChange={e => setFilters(prev => ({ ...prev, variety: e.target.value }))}
                                            className="h-8 text-xs py-0 w-32 bg-background/50"
                                        >
                                            <option value="ALL">All Varieties</option>
                                            {masterData?.varieties.map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </Select>

                                        <Select
                                            value={filters.status}
                                            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                                            className="h-8 text-xs py-0 w-32 bg-background/50"
                                        >
                                            <option value="ALL">All Status</option>
                                            <option value="Completed">Completed</option>
                                            <option value="Pending Approval">Pending</option>
                                            <option value="Rejected">Rejected</option>
                                        </Select>

                                        <Button
                                            onClick={() => setFilters({ fromDate: '', toDate: '', actionType: 'ALL', variety: 'ALL', status: 'ALL' })}
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2 text-xs"
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-hidden p-0">
                                    <div className="h-full overflow-y-auto">
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
                                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                            {new Date(item.movement_datetime).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={item.action_type === 'INWARD' ? 'success' : item.action_type === 'TRANSFER' ? 'info' : 'warning'}>
                                                                {item.action_type}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col gap-1">
                                                                {/* Quantity & SKU */}
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-sm">{item.qty_mcs} MCs</span>
                                                                    <span className="text-muted-foreground text-xs">•</span>
                                                                    <span className="font-medium text-sm">{item.variety} <span className="text-muted-foreground text-xs font-normal">({item.grade})</span></span>
                                                                </div>

                                                                {/* Flow Details */}
                                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded w-fit border border-border/30">
                                                                    {item.action_type === 'INWARD' && (
                                                                        <>
                                                                            <ArrowDownToLine size={12} className="text-emerald-500" />
                                                                            <span>Received at</span>
                                                                            <span className="font-semibold text-foreground">{item.to_location}</span>
                                                                        </>
                                                                    )}
                                                                    {item.action_type === 'TRANSFER' && (
                                                                        <>
                                                                            <span className="font-semibold text-foreground">{item.from_location}</span>
                                                                            <ArrowRight size={12} className="text-sky-500" />
                                                                            <span className="font-semibold text-foreground">{item.to_location}</span>
                                                                        </>
                                                                    )}
                                                                    {item.action_type === 'DISPATCH' && (
                                                                        <>
                                                                            <span className="font-semibold text-foreground">{item.from_location}</span>
                                                                            <ArrowUpRight size={12} className="text-amber-500" />
                                                                            <span className="font-semibold text-foreground">{item.to_location}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={item.status === 'Completed' ? 'outline' : item.status === 'Pending Approval' ? 'secondary' : item.status === 'Partial' ? 'destructive' : 'default'} className={
                                                                item.status === 'Completed' ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/5' :
                                                                    item.status === 'Partial' ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' : ''
                                                            }>
                                                                {item.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs text-muted-foreground">
                                                            {item.moved_by_name}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                onClick={() => handlePrintReceipt(item.movement_id)}
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0"
                                                                title="Print Receipt"
                                                            >
                                                                <Printer size={14} className="text-muted-foreground" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <StoreReportsView filters={filters} setFilters={setFilters} />
                    )}
                </div>
            </main>

            {/* Movement Form Modal - Uses a responsive scrollable overlay */}
            {showModal && (
                <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="min-h-full flex items-center justify-center p-4">
                        <Card className="w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl my-8" onClick={(e) => e.stopPropagation()}>
                            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-2 h-14">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    {movementType === 'INWARD' && <ArrowDownToLine className="text-emerald-500" />}
                                    {movementType === 'TRANSFER' && <ArrowRightLeft className="text-sky-500" />}
                                    {movementType === 'DISPATCH' && <Truck className="text-amber-500" />}
                                    {movementType === 'REPACK_OUT' && <Scissors className="text-indigo-500" />}
                                    {movementType === 'REPACK_IN' && <Layers className="text-purple-500" />}
                                    {isEditMode ? 'Edit ' : ''}{movementType.replace('_', ' ')} Request
                                </CardTitle>
                                <Button onClick={() => setShowModal(false)} variant="ghost" size="icon" className="rounded-full">
                                    <X size={20} />
                                </Button>
                            </CardHeader>
                            <CardContent className="p-3">

                                <form id="movement-form" onSubmit={handleSubmit}>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                        {/* Left Col: Location & Quantity */}
                                        <div className="space-y-4">
                                            {(movementType === 'TRANSFER' || movementType === 'DISPATCH') && (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">From Store *</label>
                                                    <Select
                                                        value={formData.fromStore}
                                                        onChange={(e) => setFormData({ ...formData, fromStore: e.target.value })}
                                                        required
                                                        disabled={!isGlobalUser}
                                                        className="h-9"
                                                    >
                                                        <option value="">Select store...</option>
                                                        {myStores.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </Select>
                                                </div>
                                            )}

                                            {movementType !== 'DISPATCH' && (movementType === 'INWARD' || movementType === 'TRANSFER') && (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">To Store *</label>
                                                    <Select
                                                        value={formData.toStore}
                                                        onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                        required
                                                        disabled={movementType === 'INWARD' && !isGlobalUser}
                                                        className="h-9"
                                                    >
                                                        <option value="">Select store...</option>
                                                        {(movementType === 'INWARD' ? myStores : allStores).map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                            )}

                                            {movementType === 'REPACK_OUT' && (
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Select Allocated PO *</label>
                                                        <Select
                                                            value={selectedPO}
                                                            onChange={(e) => handlePOChange(e.target.value)}
                                                            className="h-9"
                                                            required
                                                        >
                                                            <option value="">Select PO...</option>
                                                            {activePOs.map(po => (
                                                                <option key={po.id} value={po.id}>{po.po_number} - {po.customer}</option>
                                                            ))}
                                                        </Select>
                                                    </div>

                                                    {selectedPO && (
                                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                                            <label className="text-sm font-medium">Select Line Item *</label>
                                                            <Select
                                                                value={selectedLineItem}
                                                                onChange={(e) => {
                                                                    const liId = e.target.value;
                                                                    setSelectedLineItem(liId);
                                                                    const li = poLineItems.find(item => item.id.toString() === liId);
                                                                    if (li) {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            type: li.type,
                                                                            variety: li.variety,
                                                                            grade: li.grade
                                                                        }));
                                                                        fetchAllocatedStock(li.po_id, li.id);
                                                                    }
                                                                }}
                                                                className="h-9"
                                                                required
                                                            >
                                                                <option value="">Select Item...</option>
                                                                {poLineItems.map(item => (
                                                                    <option key={item.id} value={item.id}>
                                                                        {item.variety} ({item.grade}) - Ordered: {item.ordered_qty} MCs
                                                                    </option>
                                                                ))}
                                                            </Select>
                                                        </div>
                                                    )}

                                                    {selectedLineItem && (
                                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                                            <label className="text-sm font-medium">To Store (Fixed)</label>
                                                            <Input value="Production (Repacking)" readOnly className="bg-muted h-9" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {movementType === 'REPACK_IN' && (
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Original MCs (In Repacking) *</label>
                                                        <div className="border rounded-md p-2 max-h-[120px] overflow-y-auto bg-muted/20">
                                                            {inRepackingStock.length === 0 ? (
                                                                <p className="text-xs text-center py-4 text-muted-foreground">No stock currently "In Repacking"</p>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {inRepackingStock.map(stock => (
                                                                        <label key={stock.id} className="flex items-center gap-2 p-1 hover:bg-background rounded cursor-pointer text-xs">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="rounded border-gray-300"
                                                                                checked={(formData as any).originalMcNumbers?.includes(stock.mc_number)}
                                                                                onChange={(e) => {
                                                                                    const current = (formData as any).originalMcNumbers || [];
                                                                                    const updated = e.target.checked
                                                                                        ? [...current, stock.mc_number]
                                                                                        : current.filter((m: string) => m !== stock.mc_number);
                                                                                    
                                                                                    setFormData({ ...formData, originalMcNumbers: updated } as any);
                                                                                    if (e.target.checked && updated.length === 1) {
                                                                                        setFormData(prev => ({
                                                                                            ...prev,
                                                                                            originalMcNumbers: updated,
                                                                                            type: stock.type,
                                                                                            variety: stock.variety,
                                                                                            grade: stock.grade
                                                                                        }) as any);
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <span className="font-mono">{stock.mc_number}</span>
                                                                            <span className="text-muted-foreground">{stock.variety} ({stock.grade})</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {movementType === 'DISPATCH' && (
                                                <div className="space-y-3 border p-3 rounded-lg bg-orange-50/50 border-orange-100">
                                                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                                                        <div className="space-y-1 w-full sm:w-[180px] shrink-0">
                                                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purpose</label>
                                                            <div className="flex flex-col gap-2 mt-1">
                                                                <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-1.5 rounded border border-orange-100/50 hover:bg-white transition-colors">
                                                                    <input
                                                                        type="radio"
                                                                        name="purpose"
                                                                        checked={dispatchPurpose === 'SALE'}
                                                                        onChange={() => {
                                                                            setDispatchPurpose('SALE');
                                                                            setFormData(p => ({ ...p, toStore: '' }));
                                                                        }}
                                                                        className="accent-amber-600 w-4 h-4"
                                                                    />
                                                                    <span className="text-sm font-medium">Sale/Order</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-1.5 rounded border border-orange-100/50 hover:bg-white transition-colors">
                                                                    <input
                                                                        type="radio"
                                                                        name="purpose"
                                                                        checked={dispatchPurpose === 'REPACKING'}
                                                                        onChange={() => {
                                                                            setDispatchPurpose('REPACKING');
                                                                            setFormData(p => ({ ...p, toStore: 'Repacking Unit' }));
                                                                        }}
                                                                        className="accent-amber-600 w-4 h-4"
                                                                    />
                                                                    <span className="text-sm font-medium">Repacking</span>
                                                                </label>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 flex-1">
                                                            {dispatchPurpose === 'SALE' && (
                                                                <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link PO (Optional)</label>
                                                                    <Select
                                                                        value={selectedPO}
                                                                        onChange={(e) => {
                                                                            const pid = e.target.value;
                                                                            setSelectedPO(pid);
                                                                            const po = activePOs.find(p => p.id.toString() === pid);
                                                                            if (po && po.customer) {
                                                                                setFormData(prev => ({ ...prev, toStore: po.customer }));
                                                                            }
                                                                        }}
                                                                        className="h-9 bg-white"
                                                                    >
                                                                        <option value="">Select PO...</option>
                                                                        {activePOs.map(po => (
                                                                            <option key={po.id} value={po.id}>{po.po_number} - {po.customer}</option>
                                                                        ))}
                                                                    </Select>
                                                                </div>
                                                            )}
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                                    {dispatchPurpose === 'SALE' ? 'Client / Dest.' : 'Destination'}
                                                                </label>
                                                                <Input
                                                                    value={formData.toStore}
                                                                    onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                                    placeholder={dispatchPurpose === 'SALE' ? "Client Name" : "Repacking Unit"}
                                                                    required
                                                                    readOnly={dispatchPurpose === 'REPACKING'}
                                                                    className={`h-9 ${dispatchPurpose === 'REPACKING' ? 'bg-muted' : 'bg-white'}`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right Col: Attributes & Scan */}
                                        <div className="space-y-4">
                                            {movementType !== 'REPACK_OUT' && movementType !== 'REPACK_IN' && (
                                                <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-muted/10">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                                                        <Select
                                                            value={formData.type}
                                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                                            required
                                                            className="h-9 text-xs"
                                                        >
                                                            <option value="">Type...</option>
                                                            {masterData?.types.map(t => <option key={t} value={t}>{t}</option>)}
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variety</label>
                                                        <Select
                                                            value={formData.variety}
                                                            onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                                                            required
                                                            className="h-9 text-xs"
                                                        >
                                                            <option value="">Variety...</option>
                                                            {masterData?.varieties.map(v => <option key={v} value={v}>{v}</option>)}
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packing</label>
                                                        <Select
                                                            value={formData.packing}
                                                            onChange={(e) => setFormData({ ...formData, packing: e.target.value })}
                                                            required
                                                            className="h-9 text-xs"
                                                        >
                                                            <option value="">Packing...</option>
                                                            {masterData?.packings.map(p => <option key={p} value={p}>{p}</option>)}
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grade</label>
                                                        <Select
                                                            value={formData.grade}
                                                            onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                                            required
                                                            className="h-9 text-xs"
                                                        >
                                                            <option value="">Grade...</option>
                                                            {masterData?.grades.map(g => <option key={g} value={g}>{g}</option>)}
                                                        </Select>
                                                    </div>
                                                </div>
                                            )}

                                            {movementType === 'REPACK_IN' && (
                                                <div className="p-3 border rounded-lg bg-purple-50/30 border-purple-100 space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                                                            <Input value={formData.type} readOnly className="h-8 bg-muted text-xs" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variety</label>
                                                            <Input value={formData.variety} readOnly className="h-8 bg-muted text-xs" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-semibold uppercase tracking-wider text-purple-700">New Packing Label *</label>
                                                        <Select
                                                            value={formData.packing}
                                                            onChange={(e) => setFormData({ ...formData, packing: e.target.value })}
                                                            required
                                                            className="h-9 text-xs border-purple-200"
                                                        >
                                                            <option value="">Packing...</option>
                                                            {masterData?.packings.map(p => <option key={p} value={p}>{p}</option>)}
                                                        </Select>
                                                    </div>
                                                </div>
                                            )}

                                            {settings['enable_barcode_scan'] === 'true' && (
                                                <div className="flex items-center gap-3 p-3 bg-muted/40 border rounded-lg">
                                                    <Button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsScanMode(!isScanMode);
                                                            setScannedMCs([]);
                                                            setFormData(prev => ({ ...prev, qty: !isScanMode ? '0' : '' }));
                                                        }}
                                                        variant={isScanMode ? "default" : "secondary"}
                                                        size="icon"
                                                        className={isScanMode ? "bg-indigo-600 hover:bg-indigo-700" : ""}
                                                    >
                                                        <ScanBarcode size={20} />
                                                    </Button>
                                                    <div>
                                                        <div className="font-medium text-sm">Barcode Scan Mode</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {isScanMode ? 'Scan individual MCs to select' : 'Auto FIFO selection'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {!isScanMode && movementType !== 'REPACK_IN' && (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Quantity (MCs) *</label>
                                                    <Input
                                                        type="number"
                                                        value={formData.qty}
                                                        onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                                        min="1"
                                                        required
                                                        className="h-9"
                                                    />
                                                </div>
                                            )}

                                            {isScanMode && (
                                                <div className="border rounded-xl p-3 bg-muted/20 flex flex-col h-[200px]">
                                                    <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                                                        <ScanBarcode size={14} /> Scanned ({scannedMCs.length})
                                                    </h4>
                                                    <div className="flex gap-2 mb-2">
                                                        <Input
                                                            ref={barcodeInputRef}
                                                            type="text"
                                                            value={barcodeInput}
                                                            onChange={(e) => setBarcodeInput(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleBarcodeSubmit(e as any);
                                                                }
                                                            }}
                                                            placeholder="Scan..."
                                                            className="flex-1 bg-background h-9 text-xs"
                                                        />
                                                        <Button type="button" size="sm" onClick={(e) => handleBarcodeSubmit(e as any)} variant="secondary">Add</Button>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto bg-background/50 border rounded p-2 space-y-1">
                                                        {scannedMCs.map((mc, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-1 px-2 bg-card rounded text-xs border">
                                                                <span className="font-mono">{mc}</span>
                                                                <button type="button" onClick={() => removeScannedMC(mc)} className="text-muted-foreground hover:text-destructive"><Trash size={12} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </form>

                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/40">
                                    <Button type="button" onClick={() => setShowModal(false)} variant="secondary">
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        form="movement-form"
                                        disabled={submitting || (isScanMode && scannedMCs.length === 0)}
                                        className="bg-primary hover:bg-primary/90"
                                    >
                                        {submitting ? 'Submitting...' : isEditMode ? 'Update Request' : `Submit ${user?.role === 'operator' ? 'Request' : ''}`}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {toast.message}
                </div>
            )}
        </div>
    );
}

function StoreReportsView({ filters, setFilters }: { filters: any, setFilters: any }) {
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchReport();
    }, [filters.fromDate, filters.toDate]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.fromDate) params.set('fromDate', filters.fromDate);
            if (filters.toDate) params.set('toDate', filters.toDate);

            const response = await fetch(`/api/reports/store-movement?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                setReportData(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch report');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        // Simple CSV Export
        const headers = ['Store', 'Sent (MCs)', 'Received (MCs)', 'Current Balance (MCs)'];
        const rows = reportData.map(r => [r.store, r.sent, r.received, r.balance]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `store_movement_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Card className="border-border/50 bg-card/40 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-lg">Store Performance Report</CardTitle>
                        <CardDescription>Movement analysis by store (Sent vs Received).</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-md border border-border/40">
                            <Input
                                type="date"
                                value={filters.fromDate}
                                onChange={e => setFilters((prev: any) => ({ ...prev, fromDate: e.target.value }))}
                                className="h-8 text-xs py-1 w-32 bg-background/50 border-none"
                            />
                            <span className="text-muted-foreground text-xs">-</span>
                            <Input
                                type="date"
                                value={filters.toDate}
                                onChange={e => setFilters((prev: any) => ({ ...prev, toDate: e.target.value }))}
                                className="h-8 text-xs py-1 w-32 bg-background/50 border-none"
                            />
                        </div>
                        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
                            <ArrowDownToLine size={16} /> Export CSV
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="py-12 flex justify-center">
                        <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Store Name</TableHead>
                                <TableHead className="text-right text-indigo-600">Sent (Out)</TableHead>
                                <TableHead className="text-right text-emerald-600">Received (In)</TableHead>
                                <TableHead className="text-right font-bold">Current Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.map((row, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">{row.store}</TableCell>
                                    <TableCell className="text-right">{row.sent}</TableCell>
                                    <TableCell className="text-right">{row.received}</TableCell>
                                    <TableCell className="text-right font-bold">{row.balance}</TableCell>
                                </TableRow>
                            ))}
                            {reportData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        No data available for the selected period
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
