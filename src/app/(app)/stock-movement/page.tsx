'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
    Scissors,
    FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { StockSummary, UserPublic } from '@/types';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ActionHub } from '@/components/stock-movement/action-hub';
import { PendingApprovals } from '@/components/stock-movement/pending-approvals';
import { HistoryTable } from '@/components/stock-movement/history-table';
import { StockMovementSkeleton } from '@/components/ui/page-skeletons';

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
    const [view, setView] = useState<'operations' | 'reports' | 'locator'>('operations');

    // Dispatch Specific State
    const [activePOs, setActivePOs] = useState<any[]>([]);
    const [dispatchPurpose, setDispatchPurpose] = useState<'SALE' | 'REPACKING'>('SALE');
    const [selectedPO, setSelectedPO] = useState<string>('');
    const [selectedPODetails, setSelectedPODetails] = useState<any>(null);
    const [poLineItems, setPoLineItems] = useState<any[]>([]);
    const [selectedLineItem, setSelectedLineItem] = useState<string>('');
    const [dispatchPoStock, setDispatchPoStock] = useState<any[]>([]);
    const [fetchingPoStock, setFetchingPoStock] = useState(false);

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

    // Batch Transfer and Strategy States
    const [transferMode, setTransferMode] = useState<'spec' | 'batch'>('spec');
    const [allocationStrategy, setAllocationStrategy] = useState<'FIFO' | 'LIFO'>('FIFO');
    const [batchDate, setBatchDate] = useState('');
    const [batchesList, setBatchesList] = useState<any[]>([]);
    const [selectedBatchIndex, setSelectedBatchIndex] = useState<number | null>(null);
    const [loadingBatches, setLoadingBatches] = useState(false);

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

    const maxSteps = movementType === 'INWARD' || movementType === 'DISPATCH' ? 2 : 3;
    const wizardSteps = movementType === 'INWARD' ? [
        { step: 1, label: 'Specs & Location' },
        { step: 2, label: 'Confirm Quantity' }
    ] : movementType === 'DISPATCH' ? [
        { step: 1, label: 'Select PO' },
        { step: 2, label: 'Verify Stock' }
    ] : [
        { step: 1, label: movementType === 'TRANSFER' ? 'From Store & Specs' : 'SKU Specs' },
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
        refetchStock();
        refetchPending();
        refetchHistory();
        fetchMasterData();
        fetchSettings();
        fetchActivePOs();
        fetchInRepackingStock();
    };

    // React Query for stock summary
    const { data: stockResult, refetch: refetchStock } = useQuery({
        queryKey: ['stock-summary'],
        queryFn: async () => {
            const res = await fetch('/api/stock');
            if (!res.ok) throw new Error('Failed to fetch stock');
            return res.json();
        },
        enabled: !!user,
    });

    // React Query for pending requests
    const { data: pendingResult, refetch: refetchPending } = useQuery({
        queryKey: ['pending-requests'],
        queryFn: async () => {
            const res = await fetch('/api/movement/pending');
            if (!res.ok) throw new Error('Failed to fetch pending');
            return res.json();
        },
        enabled: !!user,
    });

    // React Query for history
    const { data: historyResult, refetch: refetchHistory } = useQuery({
        queryKey: ['movement-history'],
        queryFn: async () => {
            const res = await fetch('/api/movement/history');
            if (!res.ok) throw new Error('Failed to fetch history');
            return res.json();
        },
        enabled: !!user,
    });

    useEffect(() => {
        if (stockResult?.success) setStockSummary(stockResult.data);
    }, [stockResult]);

    useEffect(() => {
        if (pendingResult?.success) setPendingRequests(pendingResult.data);
    }, [pendingResult]);

    useEffect(() => {
        if (historyResult?.success) setHistory(historyResult.data);
    }, [historyResult]);

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

    useEffect(() => {
        if (settings['enable_location_mapping'] !== 'true' && view === 'locator') {
            setView('operations');
        }
    }, [settings, view]);

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
        if (movementType === 'TRANSFER' || movementType === 'REPACK_OUT') {
            fetchAvailableStockItems();
        } else if (movementType !== 'DISPATCH') {
            setAvailableStockItems([]);
        }
    }, [formData.fromStore, formData.type, formData.variety, formData.grade, formData.packing, movementType]);

    const fetchBatchesByDate = async (store: string, date: string) => {
        if (!store || !date) {
            setBatchesList([]);
            return;
        }
        setLoadingBatches(true);
        setSelectedBatchIndex(null);
        try {
            const res = await fetch(`/api/stock/batches-by-date?store=${encodeURIComponent(store)}&date=${encodeURIComponent(date)}`);
            const result = await res.json();
            if (result.success) {
                setBatchesList(result.data || []);
            } else {
                setBatchesList([]);
                console.error(result.error);
            }
        } catch (error) {
            console.error('Failed to fetch batches by date:', error);
            setBatchesList([]);
        } finally {
            setLoadingBatches(false);
        }
    };

    useEffect(() => {
        if (movementType === 'TRANSFER' && transferMode === 'batch') {
            fetchBatchesByDate(formData.fromStore, batchDate);
        }
    }, [formData.fromStore, batchDate, transferMode, movementType]);

    const fetchPOLineItems = async (poId: string) => {
        try {
            const response = await fetch(`/api/po/items?poId=${poId}`);
            const result = await response.json();
            if (result.success) setPoLineItems(result.data);
        } catch (error) { console.error(error); }
    };

    const fetchPOStockItems = async (poId: string, store?: string) => {
        setFetchingPoStock(true);
        try {
            const params = new URLSearchParams();
            if (store) params.append('store', store);
            const response = await fetch(`/api/po/${poId}/stock?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                setDispatchPoStock(result.data || []);
                setAvailableStockItems(result.data || []);
            } else {
                setDispatchPoStock([]);
                setAvailableStockItems([]);
            }
        } catch (error) {
            console.error('Failed to fetch PO stock items:', error);
            setDispatchPoStock([]);
            setAvailableStockItems([]);
        } finally {
            setFetchingPoStock(false);
        }
    };

    const handlePOChange = (poId: string) => {
        setSelectedPO(poId);
        setSelectedLineItem('');
        setPoLineItems([]);
        setFormData(prev => ({ ...prev, type: '', variety: '', grade: '', packing: '' }));
        if (poId) {
            const poDetails = activePOs.find(p => p.id.toString() === poId);
            if (movementType === 'DISPATCH') {
                setSelectedPODetails(poDetails || null);
                // Auto-populate fromStore from PO loading_store if set
                if (poDetails?.loading_store) {
                    setFormData(prev => ({ ...prev, fromStore: poDetails.loading_store, toStore: poDetails.customer || '' }));
                } else {
                    setFormData(prev => ({ ...prev, toStore: poDetails?.customer || '' }));
                }
                fetchPOStockItems(poId);
            } else {
                fetchPOLineItems(poId);
            }
        } else {
            setSelectedPODetails(null);
            setDispatchPoStock([]);
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

        // Reset dispatch-specific state
        setSelectedPO('');
        setSelectedPODetails(null);
        setDispatchPoStock([]);

        setTransferMode('spec');
        setAllocationStrategy('FIFO');
        setBatchDate('');
        setBatchesList([]);
        setSelectedBatchIndex(null);
        setLoadingBatches(false);
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
            if (movementType === 'DISPATCH') {
                // Step 1 for dispatch: PO must be selected with store and destination
                return !!selectedPO && !!selectedPODetails && !!formData.fromStore && !!formData.toStore;
            }
            if (movementType === 'TRANSFER') {
                if (transferMode === 'batch') {
                    return !!formData.fromStore && !!batchDate && selectedBatchIndex !== null;
                }
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
                // Step 2 for dispatch: need qty > 0 and not exceeding available
                if (isScanMode) {
                    return scannedMCs.length > 0;
                }
                const qtyNum = Number(formData.qty);
                return !!formData.qty && qtyNum > 0 && qtyNum <= dispatchPoStock.length;
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
            if (movementType === 'TRANSFER' && transferMode === 'batch') {
                return true;
            }
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

        setTransferMode('spec');
        setAllocationStrategy(req.allocation_strategy || 'FIFO');
        setBatchDate('');
        setBatchesList([]);
        setSelectedBatchIndex(null);
        setLoadingBatches(false);

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

    const handlePrintMasterReport = (id: string) => {
        window.open(`/stock-movement/print-master-report/${id}`, '_blank');
    };

    const handleExport = () => {
        if (!history.length) return;

        const data = history.map(item => ({
            'Date': formatDisplayDateTime(item.movement_datetime),
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
        XLSX.writeFile(wb, `Stock_Movement_${formatDisplayDate(new Date())}.xlsx`);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            // For DISPATCH: build a PO-centric payload
            const isDispatch = movementType === 'DISPATCH';
            const dispatchPayload = isDispatch ? {
                actionType: movementType,
                fromStore: formData.fromStore,
                toStore: formData.toStore || selectedPODetails?.customer || 'Customer',
                qty: isScanMode ? scannedMCs.length : parseInt(formData.qty, 10),
                poId: selectedPO ? parseInt(selectedPO) : undefined,
                dispatchPurpose: 'SALE',
                specificMCNumbers: isScanMode && scannedMCs.length > 0 ? scannedMCs : undefined,
                remarks: formData.remarks || undefined,
            } : null;

            const payload = isDispatch ? dispatchPayload : {
                actionType: movementType,
                ...formData,
                qty: parseInt(formData.qty, 10),
                allocationStrategy: movementType === 'TRANSFER' && transferMode === 'spec' ? allocationStrategy : undefined,
                specificMCNumbers: (movementType === 'TRANSFER' && transferMode === 'batch' && selectedBatchIndex !== null)
                    ? batchesList[selectedBatchIndex].mcNumbers
                    : ((isScanMode && movementType !== 'INWARD') ? scannedMCs : undefined),
                barcodes: (isScanMode && movementType === 'INWARD') ? scannedMCs : undefined,
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
                            ...(payload ?? {}),
                            change_reason: formData.changeReason,
                            qty_mcs: (payload as any)?.qty,
                            from_location: (payload as any)?.fromStore,
                            to_location: (payload as any)?.toStore,
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

    const handleCancelTransfer = async (id: string, status: string) => {
        const confirmMsg = status === 'Pending Approval'
            ? 'Cancel this pending transfer request?'
            : 'Are you sure you want to cancel this completed transfer? This will reverse the carton stock back to the source store.';
        
        if (!confirm(confirmMsg)) return;
        try {
            const res = await fetch(`/api/movement/${id}/cancel`, { method: 'POST' });
            const result = await res.json();
            if (result.success) {
                setToast({ type: 'success', message: 'Transfer cancelled successfully' });
                refreshAllData();
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Cancellation failed' });
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
    if (loading) return <StockMovementSkeleton />;
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
                    <ActionHub onOpenModal={openModal} />

                    <PendingApprovals
                        requests={pendingRequests}
                        user={user}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onAccept={handleAccept}
                        onEdit={handleEdit}
                    />

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
                            {settings['enable_location_mapping'] === 'true' && (
                                <Button
                                    variant={view === 'locator' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setView('locator')}
                                    className="px-6"
                                >
                                    Stock Locator
                                </Button>
                            )}
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

                    {view === 'operations' && (
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

                            <HistoryTable
                                history={history}
                                user={user}
                                filters={filters}
                                setFilters={setFilters}
                                masterData={masterData}
                                settings={settings}
                                onCancel={handleCancelTransfer}
                                onEdit={handleEdit}
                                onPrintReceipt={handlePrintReceipt}
                                onPrintCodes={handlePrintCodes}
                                onPrintMasterReport={handlePrintMasterReport}
                            />
                        </div>
                    )}
                    {view === 'locator' && (
                        <StockLocatorView
                            masterData={masterData}
                            user={user}
                        />
                    )}
                    {view === 'reports' && (
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

                                <form 
                                    id="movement-form" 
                                    onSubmit={handleSubmit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                        }
                                    }}
                                >
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

                                            {/* DISPATCH Step 1: Select PO */}
                                            {movementType === 'DISPATCH' && (
                                                <div className="space-y-5 animate-in fade-in duration-200">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">Purchase Order *</label>
                                                        <Select
                                                            value={selectedPO}
                                                            onChange={(e) => handlePOChange(e.target.value)}
                                                            className="h-10"
                                                            required
                                                        >
                                                            <option value="">Select PO to dispatch...</option>
                                                            {activePOs.map(po => (
                                                                <option key={po.id} value={po.id}>
                                                                    {po.po_number}{po.customer ? ` — ${po.customer}` : ''} [{po.branding_type || 'Demo'}] ({po.allocated_count || 0} MCs)
                                                                </option>
                                                            ))}
                                                        </Select>
                                                    </div>

                                                    {selectedPODetails && (
                                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                                                            {/* PO Info Cards */}
                                                            <div className="grid grid-cols-3 gap-3">
                                                                <div className="p-3 bg-muted/30 rounded-xl border border-border/40 text-center">
                                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">Type</div>
                                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                                        selectedPODetails.branding_type === 'Branded'
                                                                            ? 'bg-violet-100 text-violet-700'
                                                                            : 'bg-sky-100 text-sky-700'
                                                                    }`}>
                                                                        {selectedPODetails.branding_type || 'Demo'}
                                                                    </span>
                                                                </div>
                                                                <div className="p-3 bg-muted/30 rounded-xl border border-border/40 text-center">
                                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">Cartons</div>
                                                                    <div className="text-lg font-bold text-emerald-600">{selectedPODetails.allocated_count || 0}</div>
                                                                </div>
                                                                <div className="p-3 bg-muted/30 rounded-xl border border-border/40 text-center">
                                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide mb-1">Status</div>
                                                                    <div className="text-xs font-semibold text-foreground">{selectedPODetails.status}</div>
                                                                </div>
                                                            </div>

                                                            {/* Dispatch status warning for Branded POs */}
                                                            {selectedPODetails.branding_type === 'Branded' && (
                                                                <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-700">
                                                                    <strong>Branded PO:</strong> Only repacked (Allocated) cartons will be dispatched. Ensure Repack In is completed first.
                                                                </div>
                                                            )}
                                                            {(!selectedPODetails.branding_type || selectedPODetails.branding_type === 'Demo') && (
                                                                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg text-xs text-sky-700">
                                                                    <strong>Demo PO:</strong> Reserved cartons will be directly dispatched.
                                                                </div>
                                                            )}

                                                            {/* From Store: auto-populated from loading_store or manual */}
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Loading / Dispatch Store *</label>
                                                                <Select
                                                                    value={formData.fromStore}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setFormData(prev => ({ ...prev, fromStore: val }));
                                                                        if (selectedPO) {
                                                                            fetchPOStockItems(selectedPO, val);
                                                                        }
                                                                    }}
                                                                    required
                                                                    className="h-10"
                                                                >
                                                                    <option value="">Select store...</option>
                                                                    {allStores.map(s => (
                                                                        <option key={s} value={s}>{s}{selectedPODetails.loading_store === s ? ' ★' : ''}</option>
                                                                    ))}
                                                                </Select>
                                                                {selectedPODetails.loading_store && (
                                                                    <p className="text-xs text-muted-foreground">Loading store from PO: <strong>{selectedPODetails.loading_store}</strong></p>
                                                                )}
                                                            </div>

                                                            {/* Destination */}
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium">Client / Destination *</label>
                                                                <Input
                                                                    value={formData.toStore}
                                                                    onChange={(e) => setFormData({ ...formData, toStore: e.target.value })}
                                                                    placeholder="Client name or destination"
                                                                    required
                                                                    className="h-10"
                                                                />
                                                            </div>

                                                            {/* Remarks */}
                                                            <div className="space-y-2">
                                                                <label className="text-sm font-medium text-muted-foreground">Remarks (Optional)</label>
                                                                <Input
                                                                    value={formData.remarks}
                                                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                                                    placeholder="Add notes about this dispatch..."
                                                                    className="h-10"
                                                                />
                                                            </div>

                                                            {/* PO Stock Preview */}
                                                            {fetchingPoStock && (
                                                                <div className="text-center py-4 text-sm text-muted-foreground animate-pulse">Loading cartons...</div>
                                                            )}
                                                            {!fetchingPoStock && dispatchPoStock.length > 0 && (
                                                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-700 font-medium">
                                                                    ✓ {dispatchPoStock.length} carton(s) ready for dispatch from {formData.fromStore || 'selected store'}
                                                                </div>
                                                            )}
                                                            {!fetchingPoStock && formData.fromStore && dispatchPoStock.length === 0 && (
                                                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700">
                                                                    ⚠ No {selectedPODetails.branding_type === 'Branded' ? 'Allocated' : 'Reserved'} cartons found for this PO in <strong>{formData.fromStore}</strong>
                                                                </div>
                                                            )}
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

                                            {movementType !== 'REPACK_OUT' && movementType !== 'REPACK_IN' && movementType !== 'DISPATCH' && (() => {
                                                const isStockMode = movementType === 'TRANSFER';
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

                                                        {movementType === 'TRANSFER' && (
                                                            <div className="flex bg-muted/45 p-1 rounded-xl border border-border/40 mb-3">
                                                                <button
                                                                    type="button"
                                                                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                                                        transferMode === 'spec'
                                                                            ? 'bg-indigo-600 text-white shadow-md border border-indigo-700 dark:border-indigo-500'
                                                                            : 'text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/5'
                                                                    }`}
                                                                    onClick={() => {
                                                                        setTransferMode('spec');
                                                                        setSelectedBatchIndex(null);
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            type: '',
                                                                            variety: '',
                                                                            packing: '',
                                                                            grade: '',
                                                                            qty: ''
                                                                        }));
                                                                    }}
                                                                >
                                                                    Transfer by SKU Specs
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                                                        transferMode === 'batch'
                                                                            ? 'bg-indigo-600 text-white shadow-md border border-indigo-700 dark:border-indigo-500'
                                                                            : 'text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/5'
                                                                    }`}
                                                                    onClick={() => {
                                                                        setTransferMode('batch');
                                                                        setSelectedBatchIndex(null);
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            type: '',
                                                                            variety: '',
                                                                            packing: '',
                                                                            grade: '',
                                                                            qty: ''
                                                                        }));
                                                                    }}
                                                                >
                                                                    Transfer Entire Batch (Date-Based)
                                                                </button>
                                                            </div>
                                                        )}

                                                        {isStockMode && !formData.fromStore && (
                                                            <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                                                                {transferMode === 'batch'
                                                                    ? 'Please select a source store above to search available batches.'
                                                                    : 'Please select a source store above to filter and display available SKU specifications.'}
                                                            </div>
                                                        )}

                                                        {transferMode === 'batch' && movementType === 'TRANSFER' && formData.fromStore && (
                                                            <div className="space-y-4 animate-in fade-in duration-200">
                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium text-foreground">Packing Date *</label>
                                                                    <Input
                                                                        type="date"
                                                                        value={batchDate}
                                                                        onChange={(e) => {
                                                                            setBatchDate(e.target.value);
                                                                            setSelectedBatchIndex(null);
                                                                            setFormData(prev => ({
                                                                                ...prev,
                                                                                type: '',
                                                                                variety: '',
                                                                                packing: '',
                                                                                grade: '',
                                                                                qty: ''
                                                                            }));
                                                                        }}
                                                                        required
                                                                        className="h-10 bg-background"
                                                                    />
                                                                </div>

                                                                {batchDate && (
                                                                    <div className="space-y-3 pt-2">
                                                                        <label className="text-sm font-medium text-foreground flex justify-between items-center">
                                                                            <span>Select Batch to Transfer *</span>
                                                                            {!loadingBatches && batchesList.length > 0 && (
                                                                                <span className="text-xs text-muted-foreground font-normal">
                                                                                    {batchesList.length} batches available
                                                                                </span>
                                                                            )}
                                                                        </label>
                                                                        {loadingBatches ? (
                                                                            <div className="text-center py-6 text-xs text-muted-foreground animate-pulse">
                                                                                Loading batches...
                                                                            </div>
                                                                        ) : batchesList.length === 0 ? (
                                                                            <div className="text-xs text-center py-6 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-lg">
                                                                                No available batches found for {batchDate} at {formData.fromStore}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="grid grid-cols-1 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                                                                                {batchesList.map((batch, index) => {
                                                                                    const isSelected = selectedBatchIndex === index;
                                                                                    return (
                                                                                        <div
                                                                                            key={index}
                                                                                            onClick={() => {
                                                                                                setSelectedBatchIndex(index);
                                                                                                setFormData(prev => ({
                                                                                                    ...prev,
                                                                                                    type: batch.type,
                                                                                                    variety: batch.variety,
                                                                                                    packing: batch.packing,
                                                                                                    grade: batch.grade,
                                                                                                    qty: batch.qty.toString()
                                                                                                }));
                                                                                            }}
                                                                                            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all duration-200 flex flex-col gap-2 ${
                                                                                                isSelected
                                                                                                    ? 'bg-indigo-500/10 border-indigo-600 shadow-sm ring-1 ring-indigo-600'
                                                                                                    : 'bg-card border-border hover:bg-muted/40 hover:border-muted-foreground/30'
                                                                                            }`}
                                                                                        >
                                                                                            <div className="flex justify-between items-start">
                                                                                                <div>
                                                                                                    <span className="font-bold text-indigo-950 text-sm">{batch.type}</span>
                                                                                                    <span className="text-muted-foreground mx-1.5">•</span>
                                                                                                    <span className="font-medium text-muted-foreground">{batch.variety}</span>
                                                                                                </div>
                                                                                                <Badge className="bg-indigo-600 text-white font-semibold">
                                                                                                    {batch.qty} MCs
                                                                                                </Badge>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                                                                                                <div>
                                                                                                    Packing: <span className="font-semibold text-foreground">{batch.packing}</span>
                                                                                                </div>
                                                                                                <div>
                                                                                                    Grade: <span className="font-semibold text-foreground">{batch.grade}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="text-[10px] text-muted-foreground font-mono bg-muted/50 p-1.5 rounded border border-border/30 truncate">
                                                                                                Cartons: {batch.mcNumbers.join(', ')}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {(transferMode === 'spec' || movementType !== 'TRANSFER') && (
                                                            <>
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
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* STEP 2: Locations & Movement Flow (non-DISPATCH) */}
                                    {wizardStep === 2 && movementType !== 'INWARD' && movementType !== 'DISPATCH' && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Step 2: Operations & Locations</h3>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {movementType === 'REPACK_OUT' && (
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
                                            </div>
                                            {movementType === 'TRANSFER' && transferMode === 'spec' && (
                                                <div className="space-y-3 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allocation Strategy</label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <label
                                                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                                                allocationStrategy === 'FIFO'
                                                                    ? 'bg-white border-indigo-600 shadow-sm ring-1 ring-indigo-600'
                                                                    : 'bg-white/60 border-border hover:bg-white'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="allocationStrategy"
                                                                checked={allocationStrategy === 'FIFO'}
                                                                onChange={() => setAllocationStrategy('FIFO')}
                                                                className="accent-indigo-600 w-4 h-4 mt-0.5"
                                                            />
                                                            <div>
                                                                <span className="text-sm font-semibold text-foreground block">FIFO (First In, First Out)</span>
                                                                <span className="text-xs text-muted-foreground mt-0.5 block">Transfer oldest stock first. Best for ensuring standard rotation.</span>
                                                            </div>
                                                        </label>
                                                        <label
                                                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                                                                allocationStrategy === 'LIFO'
                                                                    ? 'bg-white border-indigo-600 shadow-sm ring-1 ring-indigo-600'
                                                                    : 'bg-white/60 border-border hover:bg-white'
                                                            }`}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name="allocationStrategy"
                                                                checked={allocationStrategy === 'LIFO'}
                                                                onChange={() => setAllocationStrategy('LIFO')}
                                                                className="accent-indigo-600 w-4 h-4 mt-0.5"
                                                            />
                                                            <div>
                                                                <span className="text-sm font-semibold text-foreground block">LIFO (Last In, First Out)</span>
                                                                <span className="text-xs text-muted-foreground mt-0.5 block">Transfer newest stock first. Best for temporary/storage purposes.</span>
                                                            </div>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}

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

                                    {/* STEP 2: DISPATCH - Carton Verification */}
                                    {wizardStep === 2 && movementType === 'DISPATCH' && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Step 2: Verify &amp; Dispatch</h3>

                                            {/* PO Summary */}
                                            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 flex flex-wrap gap-4 items-start">
                                                <div className="min-w-0">
                                                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">PO</div>
                                                    <div className="font-bold text-base mt-0.5">{selectedPODetails?.po_number || activePOs.find(p => p.id.toString() === selectedPO)?.po_number}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">To</div>
                                                    <div className="font-semibold mt-0.5">{formData.toStore}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">From</div>
                                                    <div className="font-semibold mt-0.5">{formData.fromStore}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Available</div>
                                                    <div className="font-bold text-emerald-600 mt-0.5">{dispatchPoStock.length} MCs</div>
                                                </div>
                                            </div>

                                            {/* Quantity or Scan Mode */}
                                            {!isScanMode ? (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium">Dispatch Quantity (MCs) *</label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            value={formData.qty}
                                                            onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                                                            min="1"
                                                            max={dispatchPoStock.length}
                                                            placeholder={`Max: ${dispatchPoStock.length}`}
                                                            required
                                                            className="h-10 flex-1"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="h-10 text-xs"
                                                            onClick={() => setFormData(prev => ({ ...prev, qty: dispatchPoStock.length.toString() }))}
                                                        >
                                                            All ({dispatchPoStock.length})
                                                        </Button>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">FIFO: Oldest cartons dispatched first</p>
                                                </div>
                                            ) : (
                                                <div className="p-3 bg-muted/30 border border-border/40 rounded-lg text-xs text-muted-foreground">
                                                    Scan mode: Scanned {scannedMCs.length} of {dispatchPoStock.length} MCs
                                                </div>
                                            )}

                                            {/* Carton list preview */}
                                            {dispatchPoStock.length > 0 && (
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{dispatchPoStock.length} Cartons to dispatch</label>
                                                    <div className="border border-border/40 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-muted/50 sticky top-0">
                                                                <tr>
                                                                    <th className="p-2 text-left font-semibold">MC#</th>
                                                                    <th className="p-2 text-left font-semibold">Barcode</th>
                                                                    <th className="p-2 text-left font-semibold">Store/Section</th>
                                                                    <th className="p-2 text-left font-semibold">Date</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {dispatchPoStock.map((mc, idx) => (
                                                                    <tr key={mc.id} className={`border-t border-border/30 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                                                                        <td className="p-2 font-mono font-bold">{mc.mc_number}</td>
                                                                        <td className="p-2 text-muted-foreground">{mc.barcode || mc.short_code || '—'}</td>
                                                                        <td className="p-2">{mc.cold_store}{mc.section_name ? <span className="text-muted-foreground"> · {mc.section_name}</span> : ''}</td>
                                                                        <td className="p-2 text-muted-foreground">{formatDisplayDate(mc.packing_date)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {dispatchPoStock.length === 0 && (
                                                <div className="p-6 text-center border border-dashed border-amber-500/30 rounded-xl bg-amber-500/5">
                                                    <p className="text-sm text-amber-700 font-medium">No cartons ready for dispatch</p>
                                                    <p className="text-xs text-amber-600 mt-1">Check that cartons are {selectedPODetails?.branding_type === 'Branded' ? 'Allocated (Repacked)' : 'Reserved'} for this PO in {formData.fromStore}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}



                                    {/* STEP 3 / Quantity Confirmation: Verification & Stock Confirmation */}
                                    {((movementType === 'INWARD' && wizardStep === 2) || (movementType !== 'INWARD' && wizardStep === 3)) && (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                                {movementType === 'INWARD' ? 'Step 2: Confirm Quantity' : 'Step 3: Verification & Carton Selection'}
                                            </h3>

                                            {movementType !== 'INWARD' && transferMode !== 'batch' && (
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

                                            {(movementType === 'INWARD' || (!isScanMode && transferMode !== 'batch')) && (() => {
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

                                            {movementType !== 'INWARD' && isScanMode && transferMode !== 'batch' && (
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

                                            {movementType === 'TRANSFER' && transferMode === 'batch' && selectedBatchIndex !== null && batchesList[selectedBatchIndex] && (
                                                <div className="space-y-4 animate-in fade-in duration-200">
                                                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-4 space-y-3">
                                                        <div className="flex justify-between items-center border-b pb-2 border-border/40">
                                                            <span className="font-semibold text-foreground text-sm">Selected Batch Summary</span>
                                                            <Badge className="bg-indigo-600 text-white font-semibold">
                                                                {batchesList[selectedBatchIndex].qty} MCs
                                                            </Badge>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                                            <div>
                                                                <span className="text-muted-foreground block">Product Type</span>
                                                                <span className="font-semibold text-indigo-950 mt-0.5 block">{batchesList[selectedBatchIndex].type}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground block">Variety</span>
                                                                <span className="font-semibold text-indigo-950 mt-0.5 block">{batchesList[selectedBatchIndex].variety}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground block">Packing Size</span>
                                                                <span className="font-semibold text-indigo-950 mt-0.5 block">{batchesList[selectedBatchIndex].packing}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground block">Grade</span>
                                                                <span className="font-semibold text-indigo-950 mt-0.5 block">{batchesList[selectedBatchIndex].grade}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground block">Packing Date</span>
                                                                <span className="font-semibold text-indigo-950 mt-0.5 block">{formatDisplayDate(batchDate)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5 pt-2">
                                                            <span className="text-xs font-semibold text-muted-foreground block">Master Carton Numbers ({batchesList[selectedBatchIndex].mcNumbers.length})</span>
                                                            <div className="max-h-[120px] overflow-y-auto bg-background/50 border rounded-lg p-2.5 space-y-1 text-xs font-mono">
                                                                {batchesList[selectedBatchIndex].mcNumbers.map((mc: string) => (
                                                                    <div key={mc} className="flex justify-between items-center py-1 border-b border-border/10 last:border-0">
                                                                        <span className="font-bold text-foreground">{mc}</span>
                                                                        <span className="text-[10px] text-muted-foreground">Ready for Transfer</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
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
                                        {wizardStep < maxSteps && (
                                            <Button
                                                key="next-btn"
                                                type="button"
                                                onClick={() => setWizardStep(wizardStep + 1)}
                                                disabled={!isStepValid(wizardStep)}
                                                className="bg-primary hover:bg-primary/90 h-10"
                                            >
                                                Next
                                            </Button>
                                        )}
                                        {wizardStep >= maxSteps && (
                                            <Button
                                                key="submit-btn"
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
        exportToCSV(`store_movement_performance_${formatDisplayDate(new Date())}.csv`, headers, rows);
    };

    const handleExportLedger = () => {
        if (!ledgerData) return;
        const headers = ['Date', 'Movement ID', 'Action Type', 'From Store', 'To Store', 'Variety', 'Grade', 'Packing', 'Change (MCs)', 'Running Balance (MCs)', 'Remarks'];
        const rows = ledgerData.entries.map((r: any) => [
            formatDisplayDate(r.datetime),
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
        exportToCSV(`stock_ledger_${ledgerStore}_${formatDisplayDate(new Date())}.csv`, headers, rows, metadata);
    };

    const handleExportYield = () => {
        const headers = ['Job ID', 'Date', 'Linked PO', 'Input Raw Stock', 'Input Wt (Tons)', 'Output Repacked Stock', 'Output Wt (Tons)', 'Loss (Tons)', 'Yield (%)', 'Remarks'];
        const rows = yieldData.map(r => [
            r.movementId,
            formatDisplayDate(r.date),
            r.poNumber,
            r.inputs.map((i: any) => `${i.variety} (${i.grade}) [${i.packing}] x${i.qty} (${i.weightTons}T)`).join('; '),
            r.inputTotalWeightTons,
            `${r.output.variety} (${r.output.grade}) [${r.output.packing}] x${r.output.qty} (${r.output.weightTons}T)`,
            r.outputTotalWeightTons,
            r.lossWeightTons,
            `${r.yieldPct}%`,
            r.remarks || ''
        ]);
        exportToCSV(`repacking_yield_report_${formatDisplayDate(new Date())}.csv`, headers, rows);
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
                                                        {formatDisplayDateTime(row.datetime)}
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
                                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDisplayDate(row.date)}</TableCell>
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

function StockLocatorView({ masterData, user }: { masterData: any; user: any }) {
    const [query, setQuery] = useState('');
    const [store, setStore] = useState('');
    const [type, setType] = useState('');
    const [variety, setVariety] = useState('');
    const [grade, setGrade] = useState('');
    const [packingDate, setPackingDate] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (query) params.append('query', query);
            if (store) params.append('store', store);
            if (type) params.append('type', type);
            if (variety) params.append('variety', variety);
            if (grade) params.append('grade', grade);
            if (packingDate) params.append('packingDate', packingDate);

            const res = await fetch(`/api/stock/locate?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setResults(data.data);
            }
        } catch (error) {
            console.error('Failed to locate stock:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        handleSearch();
    }, [store, type, variety, grade, packingDate]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-border/50 bg-card/40">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Search size={18} className="text-primary" />
                        Carton Location Mapping
                    </CardTitle>
                    <CardDescription>
                        Scan a barcode or enter an MC/Short Code to find its exact cold store row/chamber coordinates.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Search Input */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Scan or enter MC number, barcode, or short code..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-9 bg-background/50 border-border/60"
                                autoFocus
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={loading} className="bg-primary text-white">
                            Search
                        </Button>
                    </div>

                    {/* Filter Bar */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-border/20">
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase text-xs">Cold Store</label>
                            <Select 
                                value={store} 
                                onChange={(e) => setStore(e.target.value)} 
                                className="w-full mt-1 h-9 bg-background/50 border-border/60 text-xs"
                            >
                                <option value="">All Stores</option>
                                {masterData?.coldStores?.map((s: string) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase text-xs">Type</label>
                            <Select 
                                value={type} 
                                onChange={(e) => setType(e.target.value)} 
                                className="w-full mt-1 h-9 bg-background/50 border-border/60 text-xs"
                            >
                                <option value="">All Types</option>
                                {masterData?.types?.map((t: string) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase text-xs">Variety</label>
                            <Select 
                                value={variety} 
                                onChange={(e) => setVariety(e.target.value)} 
                                className="w-full mt-1 h-9 bg-background/50 border-border/60 text-xs"
                            >
                                <option value="">All Varieties</option>
                                {masterData?.varieties?.map((v: string) => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase text-xs">Grade</label>
                            <Select 
                                value={grade} 
                                onChange={(e) => setGrade(e.target.value)} 
                                className="w-full mt-1 h-9 bg-background/50 border-border/60 text-xs"
                            >
                                <option value="">All Grades</option>
                                {masterData?.grades?.map((g: string) => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase text-xs">Packing Date</label>
                            <Input
                                type="date"
                                value={packingDate}
                                onChange={(e) => setPackingDate(e.target.value)}
                                className="w-full mt-1 h-9 bg-background/50 border-border/60 text-xs"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            <Card className="border-border/50 bg-card/40">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-muted-foreground">Searching database...</div>
                    ) : results.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            No active cartons found matching the criteria. Only available stock is trackable.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border/30 hover:bg-transparent">
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">MC Number</th>
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Short Code</th>
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Location (Store | Section)</th>
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">SKU Specs</th>
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Packing Date</th>
                                        <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Status</th>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {results.map((c) => (
                                        <TableRow key={c.mc_number} className="border-border/20 hover:bg-muted/10">
                                            <TableCell className="font-mono font-semibold text-slate-700 dark:text-slate-300 py-3.5">{c.mc_number}</TableCell>
                                            <TableCell className="font-mono font-bold text-sm text-primary py-3.5">{c.short_code || '---'}</TableCell>
                                            <TableCell className="py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-foreground text-sm">{c.cold_store}</span>
                                                    <span className="text-muted-foreground font-light text-sm">|</span>
                                                    <Badge className="bg-indigo-600/10 text-indigo-700 hover:bg-indigo-600/10 font-bold border-indigo-200">
                                                        {c.section_name || 'Unassigned Section'}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-3.5">
                                                <div className="text-sm font-semibold">{c.variety}</div>
                                                <div className="text-xs text-muted-foreground">{c.grade} • {c.packing_code} ({c.type})</div>
                                            </TableCell>
                                            <TableCell className="py-3.5 font-mono text-xs text-muted-foreground">{formatDisplayDate(c.packing_date)}</TableCell>
                                            <TableCell className="py-3.5">
                                                <Badge variant={c.status === 'Available' ? 'outline' : 'secondary'} className={c.status === 'Available' ? 'border-emerald-300 text-emerald-700 bg-emerald-500/5' : ''}>
                                                    {c.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
