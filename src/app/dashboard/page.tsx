'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    LayoutDashboard,
    ArrowLeft,
    ChevronRight,
    Download,
    RefreshCw,
    Calendar,
    Package,
    AlertCircle,
    TrendingUp,
    Truck,
    Snowflake
} from 'lucide-react';
import type { DashboardRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import CapacityWidget from '@/components/dashboard/CapacityWidget';

export default function DashboardPage() {
    const [data, setData] = useState<DashboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [stockType, setStockType] = useState('all');
    const [varietyFilter, setVarietyFilter] = useState('all');
    const [gradeFilter, setGradeFilter] = useState('all');
    const [exporting, setExporting] = useState(false);
    const [settings, setSettings] = useState<any>({});

    // Available options for dropdowns (filtered based on selections)
    const [varieties, setVarieties] = useState<string[]>([]);
    const [grades, setGrades] = useState<string[]>([]);

    // Fetch filter options based on current type/variety selection
    const fetchFilterOptions = async (type: string, variety: string) => {
        try {
            const params = new URLSearchParams();
            if (type !== 'all') params.append('type', type);
            if (variety !== 'all') params.append('variety', variety);

            const response = await fetch(`/api/dashboard/filter-options?${params.toString()}`);
            const result = await response.json();
            if (result.success) {
                setVarieties(result.data.varieties || []);
                setGrades(result.data.grades || []);
            }
        } catch (err) {
            console.error('Failed to fetch filter options:', err);
        }
    };

    // Fetch filter options on mount and when type/variety changes
    useEffect(() => {
        fetchFilterOptions(stockType, varietyFilter);
    }, [stockType, varietyFilter]);

    // Reset variety and grade when type changes
    const handleTypeChange = (newType: string) => {
        setStockType(newType);
        setVarietyFilter('all');
        setGradeFilter('all');
    };

    // Fetch System Settings
    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.success) setSettings(data.data);
            })
            .catch(err => console.error('Failed to fetch settings', err));
    }, []);

    // Reset grade when variety changes
    const handleVarietyChange = (newVariety: string) => {
        setVarietyFilter(newVariety);
        setGradeFilter('all');
    };

    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (stockType !== 'all') params.append('type', stockType);
            if (varietyFilter !== 'all') params.append('variety', varietyFilter);
            if (gradeFilter !== 'all') params.append('grade', gradeFilter);

            const response = await fetch(`/api/dashboard?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                setData(result.data);
            } else {
                setError(result.error || 'Failed to load dashboard data');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [stockType, varietyFilter, gradeFilter]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams();
            if (stockType !== 'all') params.append('type', stockType);
            if (varietyFilter !== 'all') params.append('variety', varietyFilter);
            if (gradeFilter !== 'all') params.append('grade', gradeFilter);

            const response = await fetch(`/api/dashboard/export?${params.toString()}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `FG_Stock_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                alert('Failed to export data');
            }
        } catch (err) {
            alert('Export failed');
        } finally {
            setExporting(false);
        }
    };

    // Calculate totals
    const totals = data.reduce((acc, row) => ({
        totalMCs: acc.totalMCs + row.totalMCs,
        availableMCs: acc.availableMCs + row.availableMCs,
        reservedMCs: acc.reservedMCs + row.reservedMCs,
        allocatedMCs: acc.allocatedMCs + row.allocatedMCs,
        pendingPOMCs: acc.pendingPOMCs + row.pendingPOMCs,
    }), { totalMCs: 0, availableMCs: 0, reservedMCs: 0, allocatedMCs: 0, pendingPOMCs: 0 });

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
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <LayoutDashboard className="text-primary h-5 w-5" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">FG Store Dashboard</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {settings['enable_container_planning'] === 'true' && (
                            <Link href="/shipments">
                                <Button variant="secondary" className="gap-2">
                                    <Truck size={16} />
                                    Shipments
                                </Button>
                            </Link>
                        )}
                        <Button
                            onClick={handleExport}
                            disabled={exporting || loading || data.length === 0}
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                        >
                            {exporting ? <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent" /> : <Download size={16} />}
                            Export
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex-1 space-y-6 container mx-auto px-6 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                    {/* Capacity Widget - Span 1 col */}
                    <div className="md:col-span-1">
                        <CapacityWidget />
                    </div>

                    {/* Right Side - Stats, Filters, Table - Span 3 cols */}
                    <div className="md:col-span-3 flex flex-col space-y-6">



                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: "Total MCs", value: totals.totalMCs.toLocaleString(), icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
                                { label: "Available", value: totals.availableMCs.toLocaleString(), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                                { label: "Reserved", value: totals.reservedMCs.toLocaleString(), icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
                                { label: "Pending PO", value: totals.pendingPOMCs.toLocaleString(), icon: Package, color: "text-purple-500", bg: "bg-purple-500/10" }
                            ].map((stat, i) => (
                                <Card key={i} className="border-border/50 bg-card/40">
                                    <CardContent className="p-6 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                                            <p className="text-2xl font-bold mt-1 text-foreground">{stat.value}</p>
                                        </div>
                                        <div className={`p-3 rounded-xl ${stat.bg}`}>
                                            <stat.icon className={`h-5 w-5 ${stat.color}`} />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        {/* End Stats Cards Grid */}

                        {/* Filters */}
                        <Card className="border-border/50 bg-card/40">
                            <CardContent className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                            <Package size={14} /> Stock Type
                                        </label>
                                        <Select
                                            value={stockType}
                                            onChange={(e) => handleTypeChange(e.target.value)}
                                        >
                                            <option value="all">All Types</option>
                                            <option value="IQF">IQF</option>
                                            <option value="SLAB">SLAB</option>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                            <Package size={14} /> Variety
                                        </label>
                                        <Select
                                            value={varietyFilter}
                                            onChange={(e) => handleVarietyChange(e.target.value)}
                                        >
                                            <option value="all">All Varieties</option>
                                            {varieties.map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                            <Package size={14} /> Grade
                                        </label>
                                        <Select
                                            value={gradeFilter}
                                            onChange={(e) => setGradeFilter(e.target.value)}
                                        >
                                            <option value="all">All Grades</option>
                                            {grades.map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={fetchDashboardData} disabled={loading} className="flex-1 gap-2 bg-[#2E8B57] hover:bg-[#257045] text-white">
                                            {loading ? <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent" /> : <RefreshCw size={16} />}
                                            Refresh
                                        </Button>
                                        {(stockType !== 'all' || varietyFilter !== 'all' || gradeFilter !== 'all') && (
                                            <Button
                                                onClick={() => {
                                                    setStockType('all');
                                                    setVarietyFilter('all');
                                                    setGradeFilter('all');
                                                }}
                                                variant="secondary"
                                                size="icon"
                                                title="Clear Filters"
                                            >
                                                <RefreshCw className="h-4 w-4 rotate-45" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Data Table */}
                        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
                            <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
                                <CardTitle className="text-lg flex items-center gap-2 font-bold text-foreground">
                                    <Snowflake className="h-5 w-5 text-[#2E8B57]" />
                                    Live Stock Position
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="p-0">
                                {error ? (
                                    <div className="p-12 text-center text-destructive">
                                        <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                        <p className="text-lg font-medium">{error}</p>
                                        <Button onClick={fetchDashboardData} variant="outline" className="mt-4">Try Again</Button>
                                    </div>
                                ) : loading ? (
                                    <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                                        <div className="animate-spin h-10 w-10 border-4 border-primary rounded-full border-t-transparent mb-4" />
                                        <p>Loading inventory data...</p>
                                    </div>
                                ) : data.length === 0 ? (
                                    <div className="p-12 text-center text-muted-foreground">
                                        <Package className="mx-auto h-12 w-12 mb-4 opacity-20" />
                                        <h3 className="text-lg font-medium">No Stock Found</h3>
                                        <p className="text-sm opacity-70">Try adjusting your filters or add new stock.</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-100 hover:bg-slate-100 border-border/40">
                                                <TableHead className="font-semibold text-slate-700">Variety</TableHead>
                                                <TableHead className="font-semibold text-slate-700">Grade</TableHead>
                                                <TableHead className="font-semibold text-slate-700">Packing</TableHead>
                                                <TableHead className="text-right font-semibold text-slate-700">Available MCs</TableHead>
                                                <TableHead className="text-right font-semibold text-slate-700">FCL</TableHead>
                                                <TableHead className="text-right font-semibold text-slate-700">Aging</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.map((row, index) => {
                                                const rowKey = `${row.variety}-${row.grade}-${row.packingCode}-${index}`;
                                                const isExpanded = expandedRow === rowKey;

                                                return (
                                                    <>
                                                        <TableRow
                                                            key={rowKey}
                                                            className="border-border/40 hover:bg-muted/30 cursor-pointer"
                                                            onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                                                        >
                                                            <TableCell>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="secondary" className="font-normal">{row.variety}</Badge>
                                                                    {row.storeBreakdown && row.storeBreakdown.length > 0 && (
                                                                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                                                            <ChevronRight size={16} className="text-muted-foreground" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{row.grade}</TableCell>
                                                            <TableCell className="text-muted-foreground">{row.packingCode}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className="font-bold text-emerald-500">{row.availableMCs.toLocaleString()}</span>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                                                {row.fcl40ft.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {row.daysAging > 30 ? (
                                                                    <Badge variant="destructive" className="bg-red-500/15 text-red-500 hover:bg-red-500/25 border-0">
                                                                        {row.daysAging}d
                                                                    </Badge>
                                                                ) : row.daysAging > 14 ? (
                                                                    <Badge variant="warning" className="border-0">
                                                                        {row.daysAging}d
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground text-sm">{row.daysAging}d</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                        {isExpanded && row.storeBreakdown && (
                                                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                                <TableCell colSpan={6} className="p-4">
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                        {row.storeBreakdown.map((store, i) => (
                                                                            <div key={i} className="flex justify-between items-center bg-background/50 p-2 rounded-lg border border-border/50">
                                                                                <span className="text-sm font-medium text-muted-foreground">{store.store}</span>
                                                                                <span className="text-sm font-bold">{store.count.toLocaleString()} <span className="text-xs font-normal opacity-70">MCs</span></span>
                                                                            </div>
                                                                        ))}
                                                                        {row.storeBreakdown.length === 0 && (
                                                                            <span className="text-sm text-muted-foreground italic">No store details available</span>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </TableBody>
                                        <TableFooter className="bg-muted/50 border-t border-border/40">
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-right font-medium text-muted-foreground">Total Available Stock</TableCell>
                                                <TableCell className="text-right font-bold text-lg text-foreground">{totals.availableMCs.toLocaleString()}</TableCell>
                                                <TableCell colSpan={2} />
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    {/* End Right Column */}
                </div>
                {/* End Main Grid */}
            </main >
        </div >
    );
}
