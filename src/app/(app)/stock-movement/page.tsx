'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Package,
    Plus,
    RefreshCw,
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
    const [wizardStep, setWizardStep] = useState(1);
    const [movementType, setMovementType] = useState<MovementType>('INWARD');
    // Edit Mode State
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
    const [editingRequestStatus, setEditingRequestStatus] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ 
        type: 'success' | 'error'; 
        message: string; 
        action?: { label: string; onClick: () => void } 
    } | null>(null);
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

    // Dynamic Carton Selection / Short Code States
    const [availableStockItems, setAvailableStockItems] = useState<any[]>([]);
    const [fetchingStockItems, setFetchingStockItems] = useState(false);
    const [stockSearchQuery, setStockSearchQuery] = useState('');
    const [generatedShortCodes, setGeneratedShortCodes] = useState<string[]>([]);

    // Dynamic Stock Filters
    const [stockFilters, setStockFilters] = useState<{
        types: string[];
        varieties: string[];
        packings: string[];
        grades: string[];
    } | null>(null);
    const [loadingStockFilters, setLoadingStockFilters] = useState(false);

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
        changeReason: '',
    });

    const maxSteps = movementType === 'INWARD' ? 2 : 3;
    const wizardSteps = movementType === 'INWARD' ? [
        { step: 1, label: 'Specs & Location' },
        { step: 2, label: 'Confirm Quantity' }
    ] : [
        { step: 1, label: (movementType === 'TRANSFER' || movementType === 'DISPATCH') ? 'From Store & Specs' : 'SKU Specs' },
        { step: 2, label: 'Locations' },
        { step: 3, label: 'Verify Stock' }
    ];

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
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const response = await fetch('/api/auth/me');
            const result = await response.json();
            if (result.success) {
                setUser(result.user);
                // Pre-fetch settings & data
                fetchMasterData();
                fetchSettings();
                fetchActivePOs();
                fetchInRepackingStock();
            } else {
                router.push('/login');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

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
            const params = new URLSearchParams(filters);
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

    const fetchStockFilters = async (store: string, type = '', variety = '', packing = '') => {
        setLoadingStockFilters(true);
        try {
            const params = new URLSearchParams();
            if (store) params.append('store', store);
            if (type) params.append('type', type);
            if (variety) params.append('variety', variety);
            if (packing) params.append('packing', packing);

            const response = await fetch(`/api/stock/filters?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                setStockFilters(result.data);
            }
        } catch (error) {
            console.error('Failed to load stock filters:', error);
        } finally {
            setLoadingStockFilters(false);
        }
    };

    useEffect(() => {
        if (
            (movementType === 'TRANSFER' || movementType === 'DISPATCH' || movementType === 'REPACK_OUT')
        ) {
            fetchStockFilters(formData.fromStore, formData.type, formData.variety, formData.packing);
        } else {
            setStockFilters(null);
        }
    }, [formData.fromStore, formData.type, formData.variety, formData.packing, movementType]);

    const fetchAvailableStockItems = async () => {
        const store = formData.fromStore;
        const { type, variety, grade, packing } = formData;
        if (!store || !type || !variety || !grade || !packing) {
            setAvailableStockItems([]);
            return;
        }
        setFetchingStockItems(true);
        try {
            const params = new URLSearchParams({
                list: 'true',
                status: 'Available',
                store,
                type,
                variety,
                grade,
                packing
            });
            const response = await fetch(`/api/stock?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                setAvailableStockItems(result.data || []);
            } else {
                setAvailableStockItems([]);
            }
        } catch (error) {
            console.error('Failed to fetch available stock items:', error);
            setAvailableStockItems([]);
        } finally {
            setFetchingStockItems(false);
        }
    };

    useEffect(() => {
        if (movementType === 'TRANSFER' || movementType === 'DISPATCH' || movementType === 'REPACK_OUT') {
            fetchAvailableStockItems();
        } else {
            setAvailableStockItems([]);
        }
    }, [formData.fromStore, formData.type, formData.variety, formData.grade, formData.packing, movementType]);

    const fetchPOLineItems = async (poId: string) => {
        try {
            const response = await fetch(`/api/po/items?poId=${poId}`);
            const result = await response.json();
            if (result.success) setPoLineItems(result.data);
        } catch (error) { console.error(error); }
    };

    const handlePOChange = (poId: string) => {
        setSelectedPO(poId);
        setSelectedLineItem('');
        setPoLineItems([]);
        setFormData(prev => ({ ...prev, type: '', variety: '', grade: '', packing: '' }));
        if (poId) {
            fetchPOLineItems(poId);
        }
    };

    const fetchAllocatedStock = async (poId: number, lineItemId: number) => {
        setFetchingStockItems(true);
        try {
            const response = await fetch(`/api/stock/allocated?poId=${poId}&lineItemId=${lineItemId}`);
            const result = await response.json();
            if (result.success) {
                setAvailableStockItems(result.data || []);
            } else {
                setAvailableStockItems([]);
            }
        } catch (error) {
            console.error('Failed to fetch allocated stock items:', error);
            setAvailableStockItems([]);
        } finally {
            setFetchingStockItems(false);
        }
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
            changeReason: '',
        });

        setScannedMCs([]);
        setIsScanMode(false);
        setBarcodeInput('');
        setIsEditMode(false);
        setEditingRequestId(null);
        setEditingRequestStatus(null);
        setAvailableStockItems([]);
        setStockSearchQuery('');
        setWizardStep(1);
    };

    const isStepValid = (step: number): boolean => {
        if (step === 1) {
            if (movementType === 'REPACK_OUT') {
                return !!selectedPO && !!selectedLineItem;
            }
            if (movementType === 'REPACK_IN') {
                const hasOriginals = ((formData as any).originalMcNumbers && (formData as any).originalMcNumbers.length > 0) || scannedMCs.length > 0;
                return !!hasOriginals && !!formData.packing;
            }
            if (movementType === 'INWARD') {
                return !!formData.type && !!formData.variety && !!formData.packing && !!formData.grade && !!formData.toStore;
            }
            if (movementType === 'TRANSFER' || movementType === 'DISPATCH') {
                return !!formData.type && !!formData.variety && !!formData.packing && !!formData.grade && !!formData.fromStore;
            }
            return !!formData.type && !!formData.variety && !!formData.packing && !!formData.grade;
        }
        if (step === 2) {
            if (movementType === 'INWARD') {
                return !!formData.qty && Number(formData.qty) > 0;
            }
            if (movementType === 'TRANSFER') {
                return !!formData.fromStore && !!formData.toStore && formData.fromStore !== formData.toStore;
            }
            if (movementType === 'DISPATCH') {
                const isSalePoValid = dispatchPurpose === 'SALE' ? !!selectedPO : true;
                return !!formData.fromStore && !!formData.toStore && !!dispatchPurpose && isSalePoValid;
            }
            if (movementType === 'REPACK_OUT') {
                return !!formData.fromStore;
            }
            if (movementType === 'REPACK_IN') {
                return !!formData.toStore;
            }
            return true;
        }
        if (step === 3) {
            const isStockBased = ['TRANSFER', 'DISPATCH', 'REPACK_OUT'].includes(movementType);
            const qtyNum = Number(formData.qty);
            if (isStockBased) {
                if (isScanMode) {
                    return scannedMCs.length > 0 && scannedMCs.length <= availableStockItems.length;
                }
                return !!formData.qty && qtyNum > 0 && qtyNum <= availableStockItems.length;
            }
            return !!formData.qty && qtyNum > 0;
        }
        return true;
    };

    const openModal = (type: MovementType) => {
        setWizardStep(1);
        setMovementType(type);
        setDispatchPurpose('SALE');
        setSelectedPO('');
        resetForm(type);
        setShowModal(true);
    };

    const handleEdit = (req: any) => {
        setWizardStep(1);
        setMovementType(req.action_type);
        setEditingRequestId(req.movement_id);
        setIsEditMode(true);
        setEditingRequestStatus(req.status);

        setFormData({
            fromStore: req.from_location || '',
            toStore: req.to_location || '',
            type: req.type || '',
            variety: req.variety || '',
            packing: req.packing || '',
            grade: req.grade || '',
            qty: req.qty_mcs?.toString() || '',
            remarks: req.remarks || '',
            changeReason: '',
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

    const handlePrintCodes = (id: string) => {
        window.open(`/stock-movement/print-codes/${id}`, '_blank');
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
                items: movementType === 'REPACK_IN'
                    ? (isScanMode
                        ? scannedMCs.map(mc => ({ mcNumber: mc }))
                        : Array.from({ length: parseInt(formData.qty, 10) || 0 }).map(() => ({ mcNumber: 'GENERATE' })))
                    : undefined,
                mcNumbers: movementType === 'REPACK_OUT' ? scannedMCs : undefined,
                newPacking: movementType === 'REPACK_IN' ? formData.packing : undefined,
            };

            let response;
            if (isEditMode && editingRequestId) {
                if (editingRequestStatus !== 'Pending Approval') {
                    response = await fetch(`/api/movement/${editingRequestId}/update`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...payload,
                            change_reason: formData.changeReason,
                            qty_mcs: payload.qty,
                            from_location: payload.fromStore,
                            to_location: payload.toStore,
                        }),
                    });
                } else {
                    // UPDATE existing pending request
                    response = await fetch(`/api/movement/${editingRequestId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                }
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

                let extraMessage = '';
                let action = undefined;
                if (result.data && result.data.shortCodes && result.data.shortCodes.length > 0) {
                    const codes = result.data.shortCodes;
                    const rangeMsg = codes.length === 1
                        ? `Short Code: ${codes[0]}`
                        : `Short Codes: ${codes[0]} to ${codes[codes.length - 1]} (${codes.length} cartons)`;
                    extraMessage = `\n\nGenerated sequence: ${rangeMsg}. Please write these on the cartons sequentially.`;
                    
                    if (result.data.moveId) {
                        action = {
                            label: 'Print Codes',
                            onClick: () => handlePrintCodes(result.data.moveId)
                        };
                    }
                }

                setToast({ type: 'success', message: message + extraMessage, action });
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
                let extraAction = undefined;
                let extraMsg = '';
                if (result.data && result.data.shortCodes && result.data.shortCodes.length > 0) {
                    const codes = result.data.shortCodes;
                    const rangeMsg = codes.length === 1
                        ? `Short Code: ${codes[0]}`
                        : `Short Codes: ${codes[0]} to ${codes[codes.length - 1]} (${codes.length} cartons)`;
                    extraMsg = ` - Generated sequence: ${rangeMsg}`;
                    if (result.data.moveId) {
                        extraAction = {
                            label: 'Print Codes',
                            onClick: () => handlePrintCodes(result.data.moveId)
                        };
                    }
                }
                setToast({ 
                    type: 'success', 
                    message: 'Request approved & stock updated' + extraMsg,
                    action: extraAction
                });
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
            const duration = toast.action ? 15000 : 5000;
            const timer = setTimeout(() => setToast(null), duration);
            return () => clearTimeout(timer);
        }
    }, [toast]);
    if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div></div>;
    if (!user) return null;

    return (
        <div className="p-6 space-y-6">
            {/* Page Title & Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Stock Movement</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Record inward, transfer, dispatch and repacking operations</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleExport} variant="outline" size="sm" className="gap-2 h-9">
                        <Download size={15} /> Export
                    </Button>
                    <Button onClick={refreshAllData} variant="outline" size="sm" className="gap-2 h-9">
                        <RefreshCw size={15} /> Refresh
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-6">
                    {/* Action Hub Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div 
                            onClick={() => openModal('INWARD')} 
                            className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                                    <ArrowDownToLine size={20} />
                                </div>
                                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">Inbound</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground mb-1 group-hover:text-emerald-600 transition-colors">Inward</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">Receive stock from production, generate carton codes.</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => openModal('TRANSFER')} 
                            className="group relative overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 hover:bg-blue-500/10 hover:border-blue-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                                    <ArrowRightLeft size={20} />
                                </div>
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">Internal</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground mb-1 group-hover:text-blue-600 transition-colors">Transfer</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">Move cartons between cold store warehouses.</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => openModal('DISPATCH')} 
                            className="group relative overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 hover:bg-amber-500/10 hover:border-amber-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-amber-600 text-white shadow-lg shadow-amber-600/20">
                                    <Truck size={20} />
                                </div>
                                <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Outbound</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground mb-1 group-hover:text-amber-600 transition-colors">Dispatch</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">Allocate and ship master cartons against active POs.</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => openModal('REPACK_OUT')} 
                            className="group relative overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                                    <Scissors size={20} />
                                </div>
                                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-full">Process</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground mb-1 group-hover:text-indigo-600 transition-colors">Repack Out</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">Initiate repacking, consume source cartons.</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => openModal('REPACK_IN')} 
                            className="group relative overflow-hidden rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 hover:bg-purple-500/10 hover:border-purple-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="p-2.5 rounded-lg bg-purple-600 text-white shadow-lg shadow-purple-600/20">
                                    <Layers size={20} />
                                </div>
                                <span className="text-[10px] font-semibold text-purple-600 bg-purple-50/50 px-2 py-0.5 rounded-full">Process</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground mb-1 group-hover:text-purple-600 transition-colors">Repack In</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">Complete repacking, generate new carton codes.</p>
                            </div>
                        </div>
                    </div>

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

                                {/* Mobile Cards View */}
                                <div className="md:hidden space-y-3">
                                    {pendingRequests.map((req) => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Badge variant={req.status === 'In Transit' ? 'secondary' : (req.action_type === 'INWARD' ? 'success' : req.action_type === 'TRANSFER' ? 'info' : req.action_type === 'REPACK_OUT' ? 'warning' : 'info')}>
                                                    {req.status === 'In Transit' ? 'In Transit' : req.action_type.replace('_', ' ')}
                                                </Badge>
                                                <span className="text-muted-foreground text-xs">
                                                    {new Date(req.movement_datetime).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="font-semibold text-sm">{req.variety} <span className="text-muted-foreground text-xs">({req.grade})</span></div>
                                                <div className="text-xs text-muted-foreground">{req.packing}</div>
                                                <div className="text-xs mt-1 font-mono bg-muted/40 px-2 py-1 rounded w-fit">
                                                    {req.from_location ? `${req.from_location} → ` : ''}{req.to_location}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs pt-1.5 border-t border-border/40">
                                                <div>
                                                    <span className="text-muted-foreground">Qty: </span>
                                                    <span className="font-bold">{req.qty_mcs} MCs</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">By: </span>
                                                    <span className="font-medium">{req.moved_by_name}</span>
                                                </div>
                                            </div>
                                            {(user.role === 'admin' || user.role === 'manager') && (
                                                <div className="flex gap-2 pt-2 border-t border-border/40">
                                                    {req.status === 'In Transit' ? (
                                                        <Button
                                                            onClick={() => handleAccept(req.movement_id)}
                                                            size="sm"
                                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-1.5 h-9"
                                                        >
                                                            <CheckCircle size={14} /> Accept Transfer
                                                        </Button>
                                                    ) : (
                                                        <div className="flex w-full gap-2 justify-end">
                                                            <Button
                                                                onClick={() => handleEdit(req)}
                                                                size="sm"
                                                                variant="outline"
                                                                className="flex-1 h-9 flex items-center justify-center gap-1.5"
                                                            >
                                                                <Pencil size={14} /> Edit
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleApprove(req.movement_id)}
                                                                size="sm"
                                                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white h-9 flex items-center justify-center gap-1.5"
                                                            >
                                                                <Check size={14} /> Approve
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleReject(req.movement_id)}
                                                                size="sm"
                                                                variant="destructive"
                                                                className="h-9 w-9 p-0 rounded-lg shrink-0 flex items-center justify-center"
                                                            >
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
                                    {/* Desktop Table View */}
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
                                                            <div className="flex items-center gap-1 justify-end">
                                                                {user && (user.role === 'admin' || user.permissions?.includes('*') || user.permissions?.includes('transaction:update')) && ['INWARD', 'TRANSFER', 'DISPATCH'].includes(item.action_type) && item.status !== 'Rejected' && (
                                                                    <Button
                                                                        onClick={() => handleEdit(item)}
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0"
                                                                        title="Edit/Correct Transaction"
                                                                    >
                                                                        <Pencil size={14} className="text-blue-500" />
                                                                    </Button>
                                                                )}
                                                                {['INWARD', 'REPACK_IN'].includes(item.action_type) && item.status === 'Completed' && (
                                                                    <Button
                                                                        onClick={() => handlePrintCodes(item.movement_id)}
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0"
                                                                        title="Print Carton Codes"
                                                                    >
                                                                        <ScanBarcode size={14} className="text-indigo-600" />
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    onClick={() => handlePrintReceipt(item.movement_id)}
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0"
                                                                    title="Print Receipt"
                                                                >
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
                                                        <Badge variant={item.action_type === 'INWARD' ? 'success' : item.action_type === 'TRANSFER' ? 'info' : 'warning'}>
                                                            {item.action_type}
                                                        </Badge>
                                                        <span className="text-muted-foreground text-xs">
                                                            {new Date(item.movement_datetime).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm">{item.qty_mcs} MCs</span>
                                                            <span className="text-muted-foreground text-xs">•</span>
                                                            <span className="font-semibold text-sm">{item.variety} <span className="text-muted-foreground text-xs font-normal">({item.grade})</span></span>
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground mt-0.5">{item.packing}</div>
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded w-fit border border-border/30 mt-2">
                                                            {item.action_type === 'INWARD' && (
                                                                <>
                                                                    <ArrowDownToLine size={12} className="text-emerald-500" />
                                                                    <span>Received at {item.to_location}</span>
                                                                </>
                                                            )}
                                                            {item.action_type === 'TRANSFER' && (
                                                                <>
                                                                    <span>{item.from_location}</span>
                                                                    <ArrowRight size={12} className="text-sky-500" />
                                                                    <span>{item.to_location}</span>
                                                                </>
                                                            )}
                                                            {item.action_type === 'DISPATCH' && (
                                                                <>
                                                                    <span>{item.from_location}</span>
                                                                    <ArrowUpRight size={12} className="text-amber-500" />
                                                                    <span>{item.to_location}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs pt-2 border-t border-border/40">
                                                        <Badge variant={item.status === 'Completed' ? 'outline' : item.status === 'Pending Approval' ? 'secondary' : item.status === 'Partial' ? 'destructive' : 'default'} className={
                                                            item.status === 'Completed' ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/5' :
                                                                item.status === 'Partial' ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' : ''
                                                        }>
                                                            {item.status}
                                                        </Badge>
                                                        <span className="text-muted-foreground text-[10px]">Moved by: {item.moved_by_name}</span>
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                                                        {user && (user.role === 'admin' || user.permissions?.includes('*') || user.permissions?.includes('transaction:update')) && ['INWARD', 'TRANSFER', 'DISPATCH'].includes(item.action_type) && item.status !== 'Rejected' && (
                                                            <Button
                                                                onClick={() => handleEdit(item)}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 flex-1 flex items-center justify-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50/50"
                                                            >
                                                                <Pencil size={12} /> Edit
                                                            </Button>
                                                        )}
                                                        {['INWARD', 'REPACK_IN'].includes(item.action_type) && item.status === 'Completed' && (
                                                            <Button
                                                                onClick={() => handlePrintCodes(item.movement_id)}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 flex-1 flex items-center justify-center gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50/50"
                                                            >
                                                                <ScanBarcode size={12} /> Print
                                                            </Button>
                                                        )}
                                                        <Button
                                                            onClick={() => handlePrintReceipt(item.movement_id)}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 flex-1 flex items-center justify-center gap-1 text-muted-foreground"
                                                        >
                                                            <Printer size={12} /> Receipt
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <StoreReportsView
                            filters={filters}
                            setFilters={setFilters}
                            masterData={masterData}
                            user={user}
                            myStores={myStores}
                        />
                    )}
                </div>

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
                            <CardContent className="p-6">
                                {/* Wizard Steps Indicator */}
                                <div className="flex items-center justify-center mb-6">
                                    {wizardSteps.map((s, idx) => (
                                        <div key={s.step} className="flex items-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (s.step < wizardStep || isStepValid(s.step - 1)) {
                                                        setWizardStep(s.step);
                                                    }
                                                }}
                                                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold border transition-all ${
                                                    wizardStep === s.step
                                                        ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 shadow-sm'
                                                        : wizardStep > s.step
                                                        ? 'bg-primary/10 border-primary/25 text-primary'
                                                        : 'bg-background border-border text-muted-foreground hover:border-slate-300'
                                                }`}
                                            >
                                                {s.step}
                                            </button>
                                            <span className={`text-xs ml-2 font-medium hidden sm:inline ${wizardStep === s.step ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                                                {s.label}
                                            </span>
                                            {idx < wizardSteps.length - 1 && <div className={`w-8 sm:w-16 h-[2px] mx-2 ${wizardStep > s.step ? 'bg-primary' : 'bg-border'}`} />}
                                        </div>
                                    ))}
                                </div>

                                <form id="movement-form" onSubmit={handleSubmit}>
                                    {/* STEP 1: SKU Configuration */}
                                    {wizardStep === 1 && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Step 1: Product Specifications</h3>
                                            
                                            {movementType === 'REPACK_OUT' && (
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Select Allocated PO *</label>
                                                        <Select
                                                            value={selectedPO}
                                                            onChange={(e) => handlePOChange(e.target.value)}
                                                            className="h-10"
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
                                                                className="h-10"
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
                                                        <div className="p-4 rounded-xl border border-dashed bg-muted/40 grid grid-cols-3 gap-4 text-center">
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Type</span>
                                                                <p className="text-sm font-semibold">{formData.type}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Variety</span>
                                                                <p className="text-sm font-semibold">{formData.variety}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Grade</span>
                                                                <p className="text-sm font-semibold">{formData.grade}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {movementType === 'REPACK_IN' && (
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Original MCs (In Repacking) *</label>
                                                        <div className="border rounded-xl p-3 max-h-[160px] overflow-y-auto bg-muted/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {inRepackingStock.length === 0 ? (
                                                                <p className="text-xs text-center py-4 text-muted-foreground col-span-2">No stock currently "In Repacking"</p>
                                                            ) : (
                                                                inRepackingStock.map(stock => (
                                                                    <label key={stock.id} className="flex items-center gap-2 p-2 hover:bg-background rounded-lg border border-transparent hover:border-border cursor-pointer text-xs">
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
                                                                        <div className="min-w-0">
                                                                            <span className="font-mono font-bold block">{stock.mc_number}</span>
                                                                            <span className="text-[10px] text-muted-foreground truncate block">{stock.variety} ({stock.grade})</span>
                                                                        </div>
                                                                    </label>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>

                                                    {((formData as any).originalMcNumbers && (formData as any).originalMcNumbers.length > 0) && (
                                                        <div className="p-4 rounded-xl border border-dashed bg-muted/40 grid grid-cols-3 gap-4 text-center">
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Type</span>
                                                                <p className="text-sm font-semibold">{formData.type}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Variety</span>
                                                                <p className="text-sm font-semibold">{formData.variety}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Grade</span>
                                                                <p className="text-sm font-semibold">{formData.grade}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">New Packing Size *</label>
                                                        <Select
                                                            value={formData.packing}
                                                            onChange={(e) => setFormData({ ...formData, packing: e.target.value })}
                                                            required
                                                            className="h-10"
                                                        >
                                                            <option value="">Select Packing...</option>
                                                            {masterData?.packings.map(p => <option key={p} value={p}>{p}</option>)}
                                                        </Select>
                                                    </div>
                                                </div>
                                            )}

                                            {movementType !== 'REPACK_OUT' && movementType !== 'REPACK_IN' && (() => {
                                                const isStockMode = movementType === 'TRANSFER' || movementType === 'DISPATCH';
                                                const currentTypes = isStockMode ? (stockFilters?.types || []) : (masterData?.types || []);
                                                const currentVarieties = isStockMode ? (stockFilters?.varieties || []) : (masterData?.varieties || []);
                                                const currentPackings = isStockMode ? (stockFilters?.packings || []) : (masterData?.packings || []);
                                                const currentGrades = isStockMode ? (stockFilters?.grades || []) : (masterData?.grades || []);
                                                const isSKUDisabled = isStockMode && (!formData.fromStore || loadingStockFilters);

                                                return (
                                                    <div className="space-y-4">
                                                        {movementType === 'INWARD' && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border border-border/40 mb-2 animate-in fade-in duration-200">
                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium text-foreground">To Store *</label>
                                                                    <Select
                                                                        value={formData.toStore}
                                                                        onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                                        required
                                                                        disabled={!isGlobalUser}
                                                                        className="h-10 bg-background"
                                                                    >
                                                                        <option value="">Select store...</option>
                                                                        {myStores.map(s => (
                                                                            <option key={s} value={s}>{s}</option>
                                                                        ))}
                                                                    </Select>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium text-foreground">Remarks</label>
                                                                    <Input
                                                                        type="text"
                                                                        value={formData.remarks}
                                                                        onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                                                        placeholder="Add optional notes about this movement"
                                                                        className="h-10 bg-background"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isStockMode && (
                                                            <div className="grid grid-cols-1 gap-4 bg-muted/30 p-4 rounded-xl border border-border/40 mb-2 animate-in fade-in duration-200">
                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium text-foreground">From Store *</label>
                                                                    <Select
                                                                        value={formData.fromStore}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setFormData(prev => ({
                                                                                ...prev,
                                                                                fromStore: val,
                                                                                type: '',
                                                                                variety: '',
                                                                                packing: '',
                                                                                grade: ''
                                                                            }));
                                                                        }}
                                                                        required
                                                                        disabled={!isGlobalUser}
                                                                        className="h-10 bg-background"
                                                                    >
                                                                        <option value="">Select source store...</option>
                                                                        {myStores.map(s => (
                                                                            <option key={s} value={s}>{s}</option>
                                                                        ))}
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isStockMode && !formData.fromStore && (
                                                            <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                                                                Please select a source store above to filter and display available SKU specifications.
                                                            </div>
                                                        )}

                                                        {isStockMode && formData.fromStore && currentTypes.length === 0 && !loadingStockFilters && (
                                                            <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                                                                No available stock found in the selected store.
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Type *</label>
                                                                <Select
                                                                    value={formData.type}
                                                                    onChange={(e) => setFormData({ ...formData, type: e.target.value, variety: '', packing: '', grade: '' })}
                                                                    required
                                                                    disabled={isSKUDisabled}
                                                                    className="h-10"
                                                                >
                                                                    {loadingStockFilters ? (
                                                                        <option value="">Loading...</option>
                                                                    ) : (
                                                                        <>
                                                                            <option value="">Select Type...</option>
                                                                            {currentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                                                        </>
                                                                    )}
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Variety *</label>
                                                                <Select
                                                                    value={formData.variety}
                                                                    onChange={(e) => setFormData({ ...formData, variety: e.target.value, packing: '', grade: '' })}
                                                                    required
                                                                    disabled={isSKUDisabled}
                                                                    className="h-10"
                                                                >
                                                                    <option value="">Select Variety...</option>
                                                                    {currentVarieties.map(v => <option key={v} value={v}>{v}</option>)}
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Packing Size *</label>
                                                                <Select
                                                                    value={formData.packing}
                                                                    onChange={(e) => setFormData({ ...formData, packing: e.target.value, grade: '' })}
                                                                    required
                                                                    disabled={isSKUDisabled}
                                                                    className="h-10"
                                                                >
                                                                    <option value="">Select Packing...</option>
                                                                    {currentPackings.map(p => <option key={p} value={p}>{p}</option>)}
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Grade *</label>
                                                                <Select
                                                                    value={formData.grade}
                                                                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                                                    required
                                                                    disabled={isSKUDisabled}
                                                                    className="h-10"
                                                                >
                                                                    <option value="">Select Grade...</option>
                                                                    {currentGrades.map(g => <option key={g} value={g}>{g}</option>)}
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        {isStockMode && formData.fromStore && formData.type && formData.variety && formData.packing && formData.grade && (
                                                            <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between animate-in fade-in duration-200">
                                                                <div className="flex items-center gap-2">
                                                                    <Layers className="text-indigo-600 h-5 w-5" />
                                                                    <div>
                                                                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Current Available Stock</div>
                                                                        <div className="text-sm font-bold text-indigo-950 mt-0.5">
                                                                            {fetchingStockItems ? 'Loading...' : `${availableStockItems.length} Master Cartons (MCs)`}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Badge className="bg-indigo-600 text-white font-mono">
                                                                    {fetchingStockItems ? '...' : `${availableStockItems.length} MCs`}
                                                                </Badge>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* STEP 2: Locations & Movement Flow */}
                                    {wizardStep === 2 && movementType !== 'INWARD' && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Step 2: Operations & Locations</h3>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {(movementType === 'TRANSFER' || movementType === 'DISPATCH' || movementType === 'REPACK_OUT') && (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">From Store *</label>
                                                        <Select
                                                            value={formData.fromStore}
                                                            onChange={(e) => setFormData({ ...formData, fromStore: e.target.value })}
                                                            required
                                                            disabled={!isGlobalUser}
                                                            className="h-10"
                                                        >
                                                            <option value="">Select store...</option>
                                                            {myStores.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </Select>
                                                    </div>
                                                )}

                                                {(movementType === 'TRANSFER' || movementType === 'REPACK_IN') && (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">To Store *</label>
                                                        <Select
                                                            value={formData.toStore}
                                                            onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                            required
                                                            className="h-10"
                                                        >
                                                            <option value="">Select store...</option>
                                                            {allStores
                                                                .filter(s => movementType !== 'TRANSFER' || s !== formData.fromStore)
                                                                .map(s => (
                                                                    <option key={s} value={s}>{s}</option>
                                                                ))
                                                            }
                                                        </Select>
                                                    </div>
                                                )}

                                                {movementType === 'DISPATCH' && (
                                                    <div className="col-span-2 space-y-4 border p-4 rounded-xl bg-amber-500/5 border-amber-500/10">
                                                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                                                            <div className="space-y-1 w-full sm:w-[180px] shrink-0">
                                                                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatch Purpose</label>
                                                                <div className="flex flex-col gap-2 mt-1">
                                                                    <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-2 rounded-lg border hover:bg-white transition-colors border-orange-100/50">
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
                                                                    <label className="flex items-center gap-2 cursor-pointer bg-white/60 p-2 rounded-lg border hover:bg-white transition-colors border-orange-100/50">
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

                                                            <div className="space-y-3 flex-1 w-full">
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
                                                                            className="h-10 bg-white"
                                                                        >
                                                                            <option value="">Select PO...</option>
                                                                            {activePOs.map(po => (
                                                                                <option key={po.id} value={po.id}>{po.po_number} - {po.customer}</option>
                                                                            ))}
                                                                        </Select>
                                                                    </div>
                                                                )}
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">
                                                                        {dispatchPurpose === 'SALE' ? 'Client / Dest. *' : 'Destination'}
                                                                    </label>
                                                                    <Input
                                                                        value={formData.toStore}
                                                                        onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                                        placeholder={dispatchPurpose === 'SALE' ? "Client Name" : "Repacking Unit"}
                                                                        required
                                                                        readOnly={dispatchPurpose === 'REPACKING'}
                                                                        className={`h-10 ${dispatchPurpose === 'REPACKING' ? 'bg-muted' : 'bg-white'}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Remarks</label>
                                                <Input
                                                    type="text"
                                                    value={formData.remarks}
                                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                                    placeholder="Add optional notes about this movement"
                                                    className="h-10"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* STEP 3 / Quantity Confirmation: Verification & Stock Confirmation */}
                                    {((movementType === 'INWARD' && wizardStep === 2) || (movementType !== 'INWARD' && wizardStep === 3)) && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                                {movementType === 'INWARD' ? 'Step 2: Confirm Quantity' : 'Step 3: Verification & Carton Selection'}
                                            </h3>

                                            {movementType !== 'INWARD' && (
                                                <div className="flex items-center gap-3 p-3 bg-muted/40 border rounded-xl">
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
                                                        <div className="font-semibold text-sm">
                                                            {settings['enable_barcode_scan'] === 'true' ? 'Barcode Scan Mode' : 'Manual MC Selection Mode'}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                            {isScanMode 
                                                                ? (settings['enable_barcode_scan'] === 'true' ? 'Scan individual MCs to select' : 'Select specific MCs from list') 
                                                                : 'Auto FIFO selection'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {(movementType === 'INWARD' || !isScanMode) && (() => {
                                                const isStockBased = ['TRANSFER', 'DISPATCH', 'REPACK_OUT'].includes(movementType);
                                                const isExceeded = isStockBased && Number(formData.qty) > availableStockItems.length;
                                                return (
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <label className="text-sm font-medium">Quantity (MCs) *</label>
                                                            {isStockBased && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    Available: <span className="font-semibold text-foreground">{availableStockItems.length} MCs</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Input
                                                            type="number"
                                                            value={formData.qty}
                                                            onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                                            min="1"
                                                            max={isStockBased ? availableStockItems.length : undefined}
                                                            required
                                                            readOnly={movementType === 'REPACK_OUT'}
                                                            className={`h-10 ${movementType === 'REPACK_OUT' ? 'bg-muted' : ''} ${isExceeded ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`}
                                                        />
                                                        {isExceeded && (
                                                            <p className="text-xs text-rose-600 font-medium">
                                                                Quantity cannot exceed available stock of {availableStockItems.length} MCs.
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {movementType !== 'INWARD' && isScanMode && (
                                                <div className="border rounded-xl p-4 bg-muted/20 flex flex-col h-[320px]">
                                                    <h4 className="font-semibold text-xs mb-3 flex items-center gap-2 text-foreground">
                                                        <ScanBarcode size={14} className="text-indigo-600" /> 
                                                        {settings['enable_barcode_scan'] === 'true' ? 'Scanned / Selected' : 'Selected MCs'} ({scannedMCs.length})
                                                    </h4>

                                                    {(settings['enable_barcode_scan'] === 'true' || movementType === 'REPACK_IN') && (
                                                        <div className="flex gap-2 mb-3">
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
                                                                placeholder="Scan or enter MC number..."
                                                                className="flex-1 bg-background h-10 text-xs"
                                                            />
                                                            <Button type="button" onClick={(e) => handleBarcodeSubmit(e as any)} variant="secondary" className="h-10">Add</Button>
                                                        </div>
                                                    )}

                                                    {(movementType === 'TRANSFER' || movementType === 'DISPATCH' || movementType === 'REPACK_OUT') && (
                                                        <div className="flex-1 flex flex-col min-h-0 space-y-2">
                                                            <Input
                                                                type="text"
                                                                value={stockSearchQuery}
                                                                onChange={(e) => setStockSearchQuery(e.target.value)}
                                                                placeholder="Search short code or MC..."
                                                                className="h-9 text-xs bg-background"
                                                            />
                                                            
                                                            <div className="flex-1 overflow-y-auto bg-background/50 border rounded-lg p-2 space-y-1">
                                                                {fetchingStockItems ? (
                                                                    <p className="text-xs text-center py-4 text-muted-foreground">Loading available stock...</p>
                                                                ) : availableStockItems.length === 0 ? (
                                                                    <p className="text-xs text-center py-4 text-muted-foreground">No available MCs matching criteria</p>
                                                                ) : (
                                                                    availableStockItems
                                                                        .filter(item => {
                                                                            const q = stockSearchQuery.toLowerCase();
                                                                            return (
                                                                                (item.short_code && item.short_code.toLowerCase().includes(q)) || 
                                                                                item.mc_number.toLowerCase().includes(q)
                                                                            );
                                                                        })
                                                                        .map((item) => {
                                                                            const key = item.short_code || item.mc_number;
                                                                            const isChecked = scannedMCs.includes(key);
                                                                            return (
                                                                                <label key={item.id} className="flex items-center justify-between p-2 px-3 bg-card rounded-lg text-xs border hover:bg-muted/40 cursor-pointer transition-colors">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isChecked}
                                                                                            className="rounded border-gray-300"
                                                                                            onChange={(e) => {
                                                                                                if (e.target.checked) {
                                                                                                    const next = [...scannedMCs, key];
                                                                                                    setScannedMCs(next);
                                                                                                    setFormData(prev => ({ ...prev, qty: next.length.toString() }));
                                                                                                } else {
                                                                                                    const next = scannedMCs.filter(x => x !== key);
                                                                                                    setScannedMCs(next);
                                                                                                    setFormData(prev => ({ ...prev, qty: next.length.toString() }));
                                                                                                }
                                                                                            }}
                                                                                        />
                                                                                        <span className="font-mono font-bold">{item.short_code || '---'}</span>
                                                                                        <span className="text-muted-foreground font-mono text-[10px]">({item.mc_number})</span>
                                                                                    </div>
                                                                                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">Age: {
                                                                                        Math.max(0, Math.floor((new Date().getTime() - new Date(item.packing_date).getTime()) / (1000 * 60 * 60 * 24)))
                                                                                    }d</span>
                                                                                </label>
                                                                            );
                                                                        })
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {movementType === 'REPACK_IN' && (
                                                        <div className="flex-1 overflow-y-auto bg-background/50 border rounded-lg p-2 space-y-1">
                                                            {scannedMCs.length === 0 ? (
                                                                <p className="text-xs text-center py-4 text-muted-foreground">No custom codes added. Will auto-generate.</p>
                                                            ) : (
                                                                scannedMCs.map((mc, idx) => (
                                                                    <div key={idx} className="flex items-center justify-between p-1.5 px-3 bg-card rounded-lg text-xs border">
                                                                        <span className="font-mono">{mc}</span>
                                                                        <button type="button" onClick={() => removeScannedMC(mc)} className="text-muted-foreground hover:text-destructive"><Trash size={12} /></button>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}



                                            {isEditMode && editingRequestStatus !== 'Pending Approval' && (
                                                <div className="space-y-2 border border-red-500/20 bg-red-500/5 p-4 rounded-xl animate-in fade-in duration-200">
                                                    <label className="text-sm font-semibold text-red-600 block">Change Reason (Required) *</label>
                                                    <Input
                                                        type="text"
                                                        value={formData.changeReason}
                                                        onChange={(e) => setFormData({ ...formData, changeReason: e.target.value })}
                                                        placeholder="Provide details about why this completed transaction is being corrected"
                                                        required
                                                        className="h-10 border-red-500/30 focus-visible:ring-red-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </form>

                                {/* Wizard Controls Footer */}
                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border/40">
                                    <div>
                                        {wizardStep > 1 && (
                                            <Button type="button" onClick={() => setWizardStep(wizardStep - 1)} variant="outline" className="h-10">
                                                Back
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="button" onClick={() => setShowModal(false)} variant="secondary" className="h-10">
                                            Cancel
                                        </Button>
                                        {wizardStep < maxSteps ? (
                                            <Button
                                                type="button"
                                                onClick={() => setWizardStep(wizardStep + 1)}
                                                disabled={!isStepValid(wizardStep)}
                                                className="bg-primary hover:bg-primary/90 h-10"
                                            >
                                                Next
                                            </Button>
                                        ) : (
                                            <Button
                                                type="submit"
                                                form="movement-form"
                                                disabled={submitting || (isScanMode && scannedMCs.length === 0)}
                                                className="bg-primary hover:bg-primary/90 h-10"
                                            >
                                                {submitting ? 'Submitting...' : isEditMode ? 'Update Request' : `Submit ${user?.role === 'operator' ? 'Request' : ''}`}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-4 animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    <div className="flex items-center gap-3">
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        <span className="whitespace-pre-line text-sm font-medium">{toast.message}</span>
                    </div>
                    {toast.action && (
                        <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={toast.action.onClick}
                            className="bg-white text-emerald-800 hover:bg-emerald-50 shrink-0 font-semibold"
                        >
                            {toast.action.label}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

function StoreReportsView({
    filters,
    setFilters,
    masterData,
    user,
    myStores
}: {
    filters: any;
    setFilters: any;
    masterData: MasterData | null;
    user: UserPublic | null;
    myStores: string[];
}) {
    const [activeTab, setActiveTab] = useState<'performance' | 'ledger' | 'yield'>('performance');

    // 1. Performance Report State
    const [perfData, setPerfData] = useState<any[]>([]);
    const [perfLoading, setPerfLoading] = useState(false);

    // 2. Stock Ledger Report State
    const [ledgerStore, setLedgerStore] = useState(myStores[0] || '');
    const [ledgerVariety, setLedgerVariety] = useState('ALL');
    const [ledgerGrade, setLedgerGrade] = useState('ALL');
    const [ledgerPacking, setLedgerPacking] = useState('ALL');
    const [ledgerFromDate, setLedgerFromDate] = useState('');
    const [ledgerToDate, setLedgerToDate] = useState('');
    const [ledgerData, setLedgerData] = useState<any>(null);
    const [ledgerLoading, setLedgerLoading] = useState(false);

    // 3. Yield Report State
    const [yieldFromDate, setYieldFromDate] = useState('');
    const [yieldToDate, setYieldToDate] = useState('');
    const [yieldData, setYieldData] = useState<any[]>([]);
    const [yieldLoading, setYieldLoading] = useState(false);

    // Sync default store
    useEffect(() => {
        if (myStores.length > 0 && !ledgerStore) {
            setLedgerStore(myStores[0]);
        }
    }, [myStores]);

    // Fetch Performance Report
    useEffect(() => {
        if (activeTab === 'performance') {
            fetchPerformance();
        }
    }, [filters.fromDate, filters.toDate, activeTab]);

    // Fetch Yield Report
    useEffect(() => {
        if (activeTab === 'yield') {
            fetchYield();
        }
    }, [yieldFromDate, yieldToDate, activeTab]);

    const fetchPerformance = async () => {
        setPerfLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.fromDate) params.set('fromDate', filters.fromDate);
            if (filters.toDate) params.set('toDate', filters.toDate);

            const res = await fetch(`/api/reports/store-movement?${params.toString()}`);
            const result = await res.json();
            if (result.success) setPerfData(result.data);
        } catch (error) {
            console.error(error);
        } finally {
            setPerfLoading(false);
        }
    };

    const fetchLedger = async () => {
        if (!ledgerStore) return;
        setLedgerLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('store', ledgerStore);
            if (ledgerVariety && ledgerVariety !== 'ALL') params.set('variety', ledgerVariety);
            if (ledgerGrade && ledgerGrade !== 'ALL') params.set('grade', ledgerGrade);
            if (ledgerPacking && ledgerPacking !== 'ALL') params.set('packing', ledgerPacking);
            if (ledgerFromDate) params.set('fromDate', ledgerFromDate);
            if (ledgerToDate) params.set('toDate', ledgerToDate);

            const res = await fetch(`/api/reports/ledger?${params.toString()}`);
            const result = await res.json();
            if (result.success) setLedgerData(result.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLedgerLoading(false);
        }
    };

    const fetchYield = async () => {
        setYieldLoading(true);
        try {
            const params = new URLSearchParams();
            if (yieldFromDate) params.set('fromDate', yieldFromDate);
            if (yieldToDate) params.set('toDate', yieldToDate);

            const res = await fetch(`/api/reports/yield?${params.toString()}`);
            const result = await res.json();
            if (result.success) setYieldData(result.data);
        } catch (error) {
            console.error(error);
        } finally {
            setYieldLoading(false);
        }
    };

    // Auto-fetch ledger on filter changes
    useEffect(() => {
        if (activeTab === 'ledger') {
            fetchLedger();
        }
    }, [ledgerStore, ledgerVariety, ledgerGrade, ledgerPacking, ledgerFromDate, ledgerToDate, activeTab]);

    const handleExportPerformance = () => {
        const headers = ['Store', 'Sent (Out MCs)', 'Received (In MCs)', 'Current Balance (MCs)'];
        const rows = perfData.map(r => [r.store, r.sent, r.received, r.balance]);
        exportToCSV(`store_movement_performance_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    };

    const handleExportLedger = () => {
        if (!ledgerData) return;
        const headers = ['Date', 'Movement ID', 'Action Type', 'From Store', 'To Store', 'Variety', 'Grade', 'Packing', 'Change (MCs)', 'Running Balance (MCs)', 'Remarks'];
        const rows = ledgerData.entries.map((r: any) => [
            new Date(r.datetime).toLocaleDateString(),
            r.movementId,
            r.actionType,
            r.fromLocation || 'N/A',
            r.toLocation || 'N/A',
            r.variety,
            r.grade,
            r.packing,
            r.change,
            r.balance,
            r.remarks || ''
        ]);
        // Add Starting and Ending balance details
        const metadata = [
            [],
            ['Store', ledgerData.store],
            ['Starting Balance', ledgerData.startingBalance],
            ['Ending Balance', ledgerData.endingBalance],
        ];
        exportToCSV(`stock_ledger_${ledgerStore}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows, metadata);
    };

    const handleExportYield = () => {
        const headers = ['Job ID', 'Date', 'Linked PO', 'Input Raw Stock', 'Input Wt (Tons)', 'Output Repacked Stock', 'Output Wt (Tons)', 'Loss (Tons)', 'Yield (%)', 'Remarks'];
        const rows = yieldData.map(r => [
            r.movementId,
            r.date,
            r.poNumber,
            r.inputs.map((i: any) => `${i.variety} (${i.grade}) [${i.packing}] x${i.qty} (${i.weightTons}T)`).join('; '),
            r.inputTotalWeightTons,
            `${r.output.variety} (${r.output.grade}) [${r.output.packing}] x${r.output.qty} (${r.output.weightTons}T)`,
            r.outputTotalWeightTons,
            r.lossWeightTons,
            `${r.yieldPct}%`,
            r.remarks || ''
        ]);
        exportToCSV(`repacking_yield_report_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    };

    const exportToCSV = (filename: string, headers: string[], rows: any[][], metadata?: any[][]) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        if (metadata) {
            metadata.forEach(m => {
                csvContent += m.join(",") + "\n";
            });
            csvContent += "\n";
        }
        csvContent += headers.join(",") + "\n" + rows.map(e => e.map(val => {
            const strVal = String(val).replace(/"/g, '""');
            return strVal.includes(',') ? `"${strVal}"` : strVal;
        }).join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            {/* Horizontal Tabs Selection */}
            <div className="flex border-b border-border/40 pb-px gap-6">
                <button
                    onClick={() => setActiveTab('performance')}
                    className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'performance' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Store Performance
                    {activeTab === 'performance' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('ledger')}
                    className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'ledger' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Stock Ledger
                    {activeTab === 'ledger' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('yield')}
                    className={`pb-3 font-semibold text-sm transition-all relative ${activeTab === 'yield' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Repacking Yield
                    {activeTab === 'yield' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
            </div>

            {/* TAB CONTENT: 1. Store Performance */}
            {activeTab === 'performance' && (
                <Card className="border-border/50 bg-card/40 animate-in fade-in duration-300">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
                                <Button onClick={handleExportPerformance} variant="outline" size="sm" className="gap-2">
                                    <ArrowDownToLine size={16} /> Export CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {perfLoading ? (
                            <div className="py-12 flex justify-center">
                                <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Store Name</TableHead>
                                        <TableHead className="text-right text-indigo-600">Sent (Out MCs)</TableHead>
                                        <TableHead className="text-right text-emerald-600">Received (In MCs)</TableHead>
                                        <TableHead className="text-right font-bold">Current Balance (MCs)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {perfData.map((row, idx) => (
                                        <TableRow key={idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                                            <TableCell className="font-medium">{row.store}</TableCell>
                                            <TableCell className="text-right">{row.sent}</TableCell>
                                            <TableCell className="text-right">{row.received}</TableCell>
                                            <TableCell className="text-right font-bold">{row.balance}</TableCell>
                                        </TableRow>
                                    ))}
                                    {perfData.length === 0 && (
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
            )}

            {/* TAB CONTENT: 2. Stock Ledger */}
            {activeTab === 'ledger' && (
                <Card className="border-border/50 bg-card/40 animate-in fade-in duration-300">
                    <CardHeader className="pb-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle className="text-lg">Chronological Stock Ledger</CardTitle>
                                    <CardDescription>Continuous card history and running balances per store & SKU.</CardDescription>
                                </div>
                                <Button onClick={handleExportLedger} disabled={!ledgerData} variant="outline" size="sm" className="gap-2">
                                    <ArrowDownToLine size={16} /> Export CSV
                                </Button>
                            </div>

                            {/* Ledger Filter Toolbar */}
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-muted/20 p-3 rounded-xl border border-border/40">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Store *</label>
                                    <Select
                                        value={ledgerStore}
                                        onChange={(e) => setLedgerStore(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    >
                                        <option value="">Select store...</option>
                                        {myStores.map(s => <option key={s} value={s}>{s}</option>)}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Variety</label>
                                    <Select
                                        value={ledgerVariety}
                                        onChange={(e) => setLedgerVariety(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    >
                                        <option value="ALL">All Varieties</option>
                                        {masterData?.varieties.map(v => <option key={v} value={v}>{v}</option>)}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Grade</label>
                                    <Select
                                        value={ledgerGrade}
                                        onChange={(e) => setLedgerGrade(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    >
                                        <option value="ALL">All Grades</option>
                                        {masterData?.grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Packing</label>
                                    <Select
                                        value={ledgerPacking}
                                        onChange={(e) => setLedgerPacking(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    >
                                        <option value="ALL">All Packings</option>
                                        {masterData?.packings.map(p => <option key={p} value={p}>{p}</option>)}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">From Date</label>
                                    <Input
                                        type="date"
                                        value={ledgerFromDate}
                                        onChange={(e) => setLedgerFromDate(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">To Date</label>
                                    <Input
                                        type="date"
                                        value={ledgerToDate}
                                        onChange={(e) => setLedgerToDate(e.target.value)}
                                        className="h-8 text-xs bg-background"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {ledgerLoading ? (
                            <div className="py-12 flex justify-center">
                                <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                            </div>
                        ) : !ledgerStore ? (
                            <div className="py-8 text-center text-muted-foreground">Please select a store to view ledger.</div>
                        ) : !ledgerData ? (
                            <div className="py-8 text-center text-muted-foreground">No ledger data loaded.</div>
                        ) : (
                            <div className="space-y-4">
                                {/* Ledger Summary Header */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border bg-muted/10">
                                    <div>
                                        <div className="text-xs text-muted-foreground font-semibold">Store</div>
                                        <div className="font-bold text-sm">{ledgerData.store}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground font-semibold">Starting Balance</div>
                                        <div className="font-bold text-base text-slate-800">{ledgerData.startingBalance} MCs</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground font-semibold">Transactions Count</div>
                                        <div className="font-bold text-base text-primary">{ledgerData.entries.length}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground font-semibold">Ending Balance</div>
                                        <div className="font-bold text-base text-slate-900 border-b border-double border-slate-950 w-fit">{ledgerData.endingBalance} MCs</div>
                                    </div>
                                </div>

                                {/* Ledger Entries Table */}
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date/Time</TableHead>
                                            <TableHead>Ref ID</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Flow Path</TableHead>
                                            <TableHead>Variety/Grade/Pack</TableHead>
                                            <TableHead className="text-right">Change (MCs)</TableHead>
                                            <TableHead className="text-right font-bold">Running Balance</TableHead>
                                            <TableHead>Remarks</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* Initial Starting Balance Row */}
                                        <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 italic text-muted-foreground">
                                            <TableCell colSpan={6} className="text-sm font-semibold">Starting Balance at {ledgerFromDate || 'beginning'}</TableCell>
                                            <TableCell className="text-right font-bold text-slate-700">{ledgerData.startingBalance}</TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>

                                        {ledgerData.entries.map((row: any, idx: number) => {
                                            const isPositive = row.change > 0;
                                            return (
                                                <TableRow key={row.id || idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                        {new Date(row.datetime).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs max-w-[120px] truncate" title={row.movementId}>
                                                        {row.movementId}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={row.actionType === 'INWARD' ? 'success' : row.actionType === 'TRANSFER' ? 'info' : 'warning'} className="text-[10px]">
                                                            {row.actionType}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {row.fromLocation ? row.fromLocation : 'Production'} → {row.toLocation ? row.toLocation : 'Client'}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <div className="font-medium">{row.variety}</div>
                                                        <div className="text-[10px] text-muted-foreground">{row.grade} | {row.packing}</div>
                                                    </TableCell>
                                                    <TableCell className={`text-right font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {isPositive ? `+${row.change}` : row.change}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-slate-800">
                                                        {row.balance}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={row.remarks}>
                                                        {row.remarks || '-'}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}

                                        {ledgerData.entries.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                    No movement entries found for this period.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* TAB CONTENT: 3. Repacking Yield Analysis */}
            {activeTab === 'yield' && (
                <Card className="border-border/50 bg-card/40 animate-in fade-in duration-300">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <CardTitle className="text-lg">Repacking Yield Analysis</CardTitle>
                                <CardDescription>Compares input weights (consumed) against output weights (repacked) to compute processing loss.</CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-md border border-border/40">
                                    <Input
                                        type="date"
                                        value={yieldFromDate}
                                        onChange={e => setYieldFromDate(e.target.value)}
                                        className="h-8 text-xs py-1 w-32 bg-background/50 border-none"
                                    />
                                    <span className="text-muted-foreground text-xs">-</span>
                                    <Input
                                        type="date"
                                        value={yieldToDate}
                                        onChange={e => setYieldToDate(e.target.value)}
                                        className="h-8 text-xs py-1 w-32 bg-background/50 border-none"
                                    />
                                </div>
                                <Button onClick={handleExportYield} variant="outline" size="sm" className="gap-2">
                                    <ArrowDownToLine size={16} /> Export CSV
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {yieldLoading ? (
                            <div className="py-12 flex justify-center">
                                <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Job ID</TableHead>
                                        <TableHead>PO Ref</TableHead>
                                        <TableHead>Input Raw Stock</TableHead>
                                        <TableHead className="text-right">Input Wt (Tons)</TableHead>
                                        <TableHead>Output Repacked Stock</TableHead>
                                        <TableHead className="text-right">Output Wt (Tons)</TableHead>
                                        <TableHead className="text-right text-rose-600">Loss (Tons)</TableHead>
                                        <TableHead className="text-right font-bold">Yield (%)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {yieldData.map((row, idx) => {
                                        let yieldBadgeColor = 'bg-emerald-500/10 text-emerald-600 border-none';
                                        if (row.yieldPct < 90) {
                                            yieldBadgeColor = 'bg-rose-500/10 text-rose-600 border-none';
                                        } else if (row.yieldPct < 95) {
                                            yieldBadgeColor = 'bg-amber-500/10 text-amber-600 border-none';
                                        }

                                        return (
                                            <TableRow key={row.movementId || idx} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.date}</TableCell>
                                                <TableCell className="font-mono text-xs">{row.movementId}</TableCell>
                                                <TableCell className="text-xs font-semibold">{row.poNumber || 'N/A'}</TableCell>
                                                <TableCell className="text-xs max-w-[200px] truncate">
                                                    {row.inputs.map((inp: any, i: number) => (
                                                        <div key={i}>{inp.variety} ({inp.grade}) x{inp.qty}</div>
                                                    ))}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">{row.inputTotalWeightTons.toFixed(3)}</TableCell>
                                                <TableCell className="text-xs">
                                                    <div>{row.output.variety} ({row.output.grade}) x{row.output.qty}</div>
                                                    <div className="text-[10px] text-muted-foreground">New Packing: {row.output.packing}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">{row.outputTotalWeightTons.toFixed(3)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs text-rose-600">
                                                    {row.lossWeightTons.toFixed(3)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={`font-mono text-xs font-bold ${yieldBadgeColor}`}>
                                                        {row.yieldPct.toFixed(2)}%
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {yieldData.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                No repacking jobs found for the selected period
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
