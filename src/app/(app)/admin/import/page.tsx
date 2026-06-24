'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Upload,
    FileSpreadsheet,
    Download,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Info,
    RefreshCw,
    Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

type ImportType = 'master' | 'inward';

export default function ImportWizard() {
    const router = useRouter();
    const [importType, setImportType] = useState<ImportType>('master');
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [userPermissions, setUserPermissions] = useState<string[]>([]);
    const [currentUserRole, setCurrentUserRole] = useState('');

    // Response State
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [results, setResults] = useState<any>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/me');
                const data = await res.json();
                if (!data.success || !data.user) {
                    router.push('/login');
                    return;
                }
                const perms = data.user.permissions || [];
                setUserPermissions(perms);
                setCurrentUserRole(data.user.role);

                // Operator can only do transactions; Admin/GM can do master
                const isAdmin = data.user.role === 'admin';
                const canMaster = perms.includes('master:manage') || perms.includes('*');

                if (!isAdmin && !canMaster) {
                    setImportType('inward'); // Fallback default for operator
                }
            } catch (e) {
                router.push('/dashboard');
            }
        };
        checkAuth();
    }, [router]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls') || droppedFile.name.endsWith('.csv')) {
                setFile(droppedFile);
                setStatus('idle');
                setErrorMsg('');
                setResults(null);
            } else {
                setErrorMsg('Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.');
                setStatus('error');
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setStatus('idle');
            setErrorMsg('');
            setResults(null);
        }
    };

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();

        if (importType === 'master') {
            // Stores Sheet
            const storesData = [
                { name: 'AME Store', type: 'Cold Store', location: 'Section A', capacity_tons: 250, has_loading_facility: 1, is_active: 1 },
                { name: 'BME Unit', type: 'Processing Unit', location: 'Section B', capacity_tons: 100, has_loading_facility: 0, is_active: 1 }
            ];
            const wsStores = XLSX.utils.json_to_sheet(storesData);
            XLSX.utils.book_append_sheet(wb, wsStores, 'stores');

            // Varieties Sheet
            const varietiesData = [
                { variety: 'PDTO', mcs_per_fcl: 100 },
                { variety: 'HLSO', mcs_per_fcl: 200 }
            ];
            const wsVarieties = XLSX.utils.json_to_sheet(varietiesData);
            XLSX.utils.book_append_sheet(wb, wsVarieties, 'varieties');

            // Grades Sheet
            const gradesData = [{ grade: '13/15' }, { grade: '16/20' }, { grade: '21/25' }];
            const wsGrades = XLSX.utils.json_to_sheet(gradesData);
            XLSX.utils.book_append_sheet(wb, wsGrades, 'grades');

            // Packings Sheet
            const packingsData = [{ packing: '10 X 1 KG' }, { packing: '5 X 2 LBS' }];
            const wsPackings = XLSX.utils.json_to_sheet(packingsData);
            XLSX.utils.book_append_sheet(wb, wsPackings, 'packings');

            // Types Sheet
            const typesData = [{ type: 'IQF' }, { type: 'SLAB' }];
            const wsTypes = XLSX.utils.json_to_sheet(typesData);
            XLSX.utils.book_append_sheet(wb, wsTypes, 'types');

            XLSX.writeFile(wb, 'Master_Data_Import_Template.xlsx');
        } else {
            // Inwards Sheet
            const inwardsData = [
                {
                    toStore: 'AME',
                    type: 'IQF',
                    variety: 'PDTO',
                    packing: '10 X 1 KG',
                    grade: '13/15',
                    qty: 5,
                    remarks: 'First sample bulk inward',
                    packingDate: '2026-06-01',
                    barcodes: 'BC-001,BC-002,BC-003,BC-004,BC-005'
                },
                {
                    toStore: 'BME',
                    type: 'SLAB',
                    variety: 'HLSO',
                    packing: '5 X 2 LBS',
                    grade: '16/20',
                    qty: 2,
                    remarks: 'Second sample bulk inward',
                    packingDate: '',
                    barcodes: ''
                }
            ];
            const wsInwards = XLSX.utils.json_to_sheet(inwardsData);
            XLSX.utils.book_append_sheet(wb, wsInwards, 'inwards');
            XLSX.writeFile(wb, 'Stock_Inward_Import_Template.xlsx');
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setLoading(true);
        setStatus('idle');
        setErrorMsg('');
        setResults(null);

        const formData = new FormData();
        formData.append('file', file);

        const url = importType === 'master' ? '/api/admin/import/master' : '/api/movement/import';

        try {
            const res = await fetch(url, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (data.success) {
                setStatus('success');
                setResults(data.data);
                setFile(null); // Clear selected file on success
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Failed to complete importing process.');
            }
        } catch (err) {
            setStatus('error');
            setErrorMsg('A network error occurred. Please check database connectivity.');
        } finally {
            setLoading(false);
        }
    };

    const isMasterAllowed = currentUserRole === 'admin' || userPermissions.includes('master:manage') || userPermissions.includes('*');

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
            {/* Header */}
            <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon" className="rounded-full text-slate-400 hover:text-white hover:bg-slate-900">
                                <ArrowLeft size={20} />
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <Upload className="text-emerald-500 h-5 w-5" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">Bulk Import Wizard</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 border-slate-800 hover:bg-slate-900 text-slate-300"
                            onClick={downloadTemplate}
                        >
                            <Download size={16} />
                            Template Download
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-6 py-8 max-w-4xl">
                <div className="space-y-6">
                    {/* Mode Selector */}
                    {isMasterAllowed && (
                        <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800 max-w-md mx-auto">
                            <button
                                onClick={() => { setImportType('master'); setFile(null); setResults(null); setStatus('idle'); }}
                                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${importType === 'master'
                                    ? 'bg-slate-800 text-emerald-400 shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                Master Data
                            </button>
                            <button
                                onClick={() => { setImportType('inward'); setFile(null); setResults(null); setStatus('idle'); }}
                                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${importType === 'inward'
                                    ? 'bg-slate-800 text-emerald-400 shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                Stock Inward
                            </button>
                        </div>
                    )}

                    {/* Drag-and-drop Card */}
                    <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md">
                        <CardHeader className="text-center pb-4">
                            <CardTitle className="text-xl">
                                {importType === 'master' ? 'Import System Master Data' : 'Import Production Inward Logs'}
                            </CardTitle>
                            <CardDescription className="text-slate-400 text-sm max-w-lg mx-auto">
                                {importType === 'master'
                                    ? 'Supports bulk setup of Cold Stores, Varieties, Grades, Packings, and Product Types via structured sheets.'
                                    : 'Import multiple stock entry movements simultaneously. Stock will automatically allocate to pending orders.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Drag Zone */}
                            <div
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 relative ${dragActive
                                    ? 'border-emerald-500 bg-emerald-500/5'
                                    : file
                                        ? 'border-slate-700 bg-slate-900/30'
                                        : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
                                    }`}
                            >
                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFileChange}
                                />
                                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                                    <div className={`p-4 rounded-full ${file ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-400'}`}>
                                        {file ? <FileSpreadsheet size={32} /> : <Upload size={32} />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">
                                            {file ? file.name : 'Click to upload or drag & drop'}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Excel (.xlsx, .xls) or CSV templates'}
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4">
                                {file && (
                                    <Button
                                        onClick={() => { setFile(null); setStatus('idle'); }}
                                        variant="outline"
                                        className="flex-1 border-slate-800 hover:bg-slate-900 text-slate-300 py-6 text-base"
                                        disabled={loading}
                                    >
                                        Clear File
                                    </Button>
                                )}
                                <Button
                                    onClick={handleImport}
                                    className={`flex-1 py-6 text-base ${file ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/10' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                                    disabled={!file || loading}
                                >
                                    {loading ? (
                                        <span className="flex items-center gap-2">
                                            <RefreshCw className="animate-spin h-5 w-5" /> Processing...
                                        </span>
                                    ) : (
                                        'Process Data Import'
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Result Alerts */}
                    <AnimatePresence mode="wait">
                        {status === 'success' && (
                            <motion.div
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                className="space-y-4"
                            >
                                <Card className="border-emerald-500/30 bg-emerald-950/10">
                                    <CardContent className="p-6 flex items-start gap-4">
                                        <CheckCircle2 className="text-emerald-500 h-6 w-6 mt-0.5 shrink-0" />
                                        <div className="space-y-1">
                                            <h4 className="font-bold text-emerald-400">Import Completed Successfully</h4>
                                            <p className="text-sm text-slate-300">
                                                All valid rows have been saved inside the database. Inventory levels have been refreshed.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Import Stats Details Grid */}
                                {results && importType === 'master' && (
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                        {Object.entries(results).map(([sheet, stat]: [string, any]) => (
                                            <Card key={sheet} className="border-slate-800 bg-slate-900/30">
                                                <CardContent className="p-4 text-center space-y-1">
                                                    <span className="text-xs uppercase text-slate-500 font-mono tracking-wider">{sheet}</span>
                                                    <div className="text-2xl font-extrabold text-white">{stat.success}</div>
                                                    <Badge variant="outline" className={`text-[10px] ${stat.failed > 0 ? 'text-red-400 border-red-500/20 bg-red-500/5' : 'text-slate-500 border-slate-800'}`}>
                                                        {stat.failed} Failed
                                                    </Badge>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}

                                {results && importType === 'inward' && (
                                    <Card className="border-slate-800 bg-slate-900/30">
                                        <CardContent className="p-4 flex items-center justify-around text-center">
                                            <div>
                                                <span className="text-xs uppercase text-slate-500 font-mono">Total Processed</span>
                                                <div className="text-2xl font-black mt-1 text-white">{results.total}</div>
                                            </div>
                                            <div className="h-8 w-px bg-slate-800" />
                                            <div>
                                                <span className="text-xs uppercase text-slate-500 font-mono">Successful Inwards</span>
                                                <div className="text-2xl font-black mt-1 text-emerald-400">{results.success}</div>
                                            </div>
                                            <div className="h-8 w-px bg-slate-800" />
                                            <div>
                                                <span className="text-xs uppercase text-slate-500 font-mono">Rejected Rows</span>
                                                <div className="text-2xl font-black mt-1 text-red-500">{results.failed}</div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </motion.div>
                        )}

                        {status === 'error' && (
                            <motion.div
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                            >
                                <Card className="border-red-500/30 bg-red-950/10">
                                    <CardContent className="p-6 flex items-start gap-4">
                                        <XCircle className="text-red-500 h-6 w-6 mt-0.5 shrink-0" />
                                        <div className="space-y-1">
                                            <h4 className="font-bold text-red-400">Import Aborted (Transaction Rolled Back)</h4>
                                            <p className="text-sm text-slate-300">{errorMsg}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
