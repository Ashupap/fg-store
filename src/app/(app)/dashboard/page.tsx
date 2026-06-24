'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronRight,
    Download,
    RefreshCw,
    Package,
    AlertCircle,
    TrendingUp,
    Snowflake,
    Filter,
    Map,
    Search,
    X,
    Info,
    LayoutGrid,
    Layers
} from 'lucide-react';
import type { DashboardRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import CapacityWidget from '@/components/dashboard/CapacityWidget';
import { formatDisplayDate } from '@/lib/utils';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.user) {
                    if (data.user.role !== 'operator') {
                        if (data.user.role === 'marketing_manager') {
                            router.replace('/po-allocation');
                        } else {
                            router.replace('/stock-movement');
                        }
                    } else {
                        setUser(data.user);
                        setAuthLoading(false);
                    }
                } else {
                    router.push('/login');
                }
            })
            .catch(err => {
                console.error('Failed to fetch user', err);
                router.push('/login');
            });
    }, [router]);

    const [data, setData] = useState<DashboardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [stockType, setStockType] = useState('all');
    const [varietyFilter, setVarietyFilter] = useState('all');
    const [gradeFilter, setGradeFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [settings, setSettings] = useState<any>({});

    // Interactive Grid Map state
    const [dashboardView, setDashboardView] = useState<'table' | 'map'>('table');
    const [sections, setSections] = useState<any[]>([]);
    const [activeStock, setActiveStock] = useState<any[]>([]);
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [selectedSection, setSelectedSection] = useState<any | null>(null);
    const [drawerSearch, setDrawerSearch] = useState('');
    const [drawerTab, setDrawerTab] = useState<'sku' | 'checklist'>('sku');

    const fetchMapData = async () => {
        try {
            const sectionsRes = await fetch('/api/admin/sections');
            const sectionsData = await sectionsRes.json();
            if (sectionsData.success) {
                setSections(sectionsData.data);
                if (sectionsData.data.length > 0 && !selectedStore) {
                    setSelectedStore(sectionsData.data[0].storeName);
                }
            }

            const stockRes = await fetch('/api/stock/locate?limit=none');
            const stockData = await stockRes.json();
            if (stockData.success) {
                setActiveStock(stockData.data);
            }
        } catch (err) {
            console.error('Failed to load map data:', err);
        }
    };

    useEffect(() => {
        if (dashboardView === 'map') {
            fetchMapData();
        }
    }, [dashboardView]);

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

    // Force table view if location mapping setting is disabled
    useEffect(() => {
        if (settings['enable_location_mapping'] !== 'true' && dashboardView === 'map') {
            setDashboardView('table');
        }
    }, [settings, dashboardView]);

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
                a.download = `FG_Stock_Dashboard_${formatDisplayDate(new Date())}.xlsx`;
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

    if (authLoading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-muted-foreground">
                <div className="animate-spin h-10 w-10 border-4 border-primary rounded-full border-t-transparent mb-4" />
                <p className="text-sm font-semibold tracking-wide">Verifying authorization...</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Page Title + Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">FG Stock Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Live inventory position across all stores</p>
                </div>
                <Button
                    onClick={handleExport}
                    disabled={exporting || loading || data.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 w-full sm:w-auto"
                >
                    {exporting ? <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent" /> : <Download size={16} />}
                    Export to Excel
                </Button>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                    {/* Capacity Widget - Span 1 col */}
                    <div className="md:col-span-1">
                        <CapacityWidget />
                    </div>

                    {/* Right Side - Stats, Filters, Table - Span 3 cols */}
                    <div className="md:col-span-3 flex flex-col space-y-6">

                        {/* View Switcher */}
                        {settings['enable_location_mapping'] === 'true' && (
                            <div className="flex justify-between items-center bg-card/40 border border-border/50 p-2 rounded-xl backdrop-blur-sm shadow-sm">
                                <span className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-wider">Layout View</span>
                                <div className="bg-muted p-1 rounded-lg flex gap-1">
                                    <Button
                                        variant={dashboardView === 'table' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setDashboardView('table')}
                                        className="h-8 px-4 text-xs font-semibold"
                                    >
                                        <TrendingUp size={14} className="mr-1.5" /> Live Stock Table
                                    </Button>
                                    <Button
                                        variant={dashboardView === 'map' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setDashboardView('map')}
                                        className="h-8 px-4 text-xs font-semibold"
                                    >
                                        <Map size={14} className="mr-1.5" /> Interactive Section Map
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: "Total MCs", value: totals.totalMCs.toLocaleString(), icon: Package, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-l-4 border-l-blue-500" },
                                { label: "Available", value: totals.availableMCs.toLocaleString(), icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-l-4 border-l-emerald-500" },
                                { label: "Reserved", value: totals.reservedMCs.toLocaleString(), icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-l-4 border-l-amber-500" },
                                { label: "Pending PO", value: totals.pendingPOMCs.toLocaleString(), icon: Package, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-l-4 border-l-purple-500" }
                            ].map((stat, i) => (
                                <Card key={i} className={`border-y-border/50 border-r-border/50 bg-card/40 ${stat.border}`}>
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

                        {dashboardView === 'table' ? (
                            <>
                                {/* Collapsible Filters */}
                                <Card className="border-border/50 bg-card/40">
                                    <div className="p-4 flex items-center justify-between md:hidden border-b border-border/10">
                                        <span className="text-sm font-semibold flex items-center gap-2 text-foreground">
                                            <Filter size={16} className="text-muted-foreground" /> Filters
                                        </span>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => setShowFilters(!showFilters)}
                                            className="h-8 text-xs gap-1.5"
                                        >
                                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                                        </Button>
                                    </div>
                                    <CardContent className={`p-6 ${showFilters ? 'block' : 'hidden md:block'}`}>
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
                                            <div className="overflow-x-auto w-full">
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
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <WarehouseGridMap
                                sections={sections}
                                activeStock={activeStock}
                                selectedStore={selectedStore}
                                setSelectedStore={setSelectedStore}
                                selectedSection={selectedSection}
                                setSelectedSection={setSelectedSection}
                                drawerSearch={drawerSearch}
                                setDrawerSearch={setDrawerSearch}
                                drawerTab={drawerTab}
                                setDrawerTab={setDrawerTab}
                            />
                        )}
                    </div>
                    {/* End Right Column */}
                </div>
            </div>
        </div>
    );
}

interface WarehouseGridMapProps {
    sections: any[];
    activeStock: any[];
    selectedStore: string;
    setSelectedStore: (s: string) => void;
    selectedSection: any | null;
    setSelectedSection: (sec: any | null) => void;
    drawerSearch: string;
    setDrawerSearch: (s: string) => void;
    drawerTab: 'sku' | 'checklist';
    setDrawerTab: (tab: 'sku' | 'checklist') => void;
}

function WarehouseGridMap({
    sections,
    activeStock,
    selectedStore,
    setSelectedStore,
    selectedSection,
    setSelectedSection,
    drawerSearch,
    setDrawerSearch,
    drawerTab,
    setDrawerTab
}: WarehouseGridMapProps) {
    const storeMap = new globalThis.Map<string, string>();
    sections.forEach(s => {
        if (s.storeName) {
            storeMap.set(s.storeName, s.storeType || 'Cold Store');
        }
    });
    const uniqueStores = Array.from(storeMap.entries())
        .map(([name, type]) => ({ name, type }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const storeSections = sections.filter(s => s.storeName === selectedStore);
    const storeStock = activeStock.filter(c => c.cold_store === selectedStore);

    const sectionCartonsMap: { [key: string]: any[] } = {};
    storeSections.forEach(sec => {
        sectionCartonsMap[sec.name] = storeStock.filter(c => c.section_name === sec.name);
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Store Tabs Selector */}
            <div className="flex flex-wrap gap-2 border-b border-border/20 pb-4">
                {uniqueStores.map(store => (
                    <Button
                        key={store.name}
                        variant={selectedStore === store.name ? 'default' : 'outline'}
                        onClick={() => setSelectedStore(store.name)}
                        className="h-9 px-4 text-xs font-semibold gap-1.5"
                    >
                        <Snowflake size={14} className="mr-0.5" />
                        {store.name}
                        {store.type === 'Rented' && (
                            <span className="text-[8px] bg-violet-600 text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">
                                Rented
                            </span>
                        )}
                    </Button>
                ))}
            </div>

            {/* Grid of Sections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {storeSections.map(section => {
                    const cartons = sectionCartonsMap[section.name] || [];
                    const occupied = cartons.length;
                    const capacity = section.capacityMcs;
                    const pct = Math.min(100, capacity > 0 ? (occupied / capacity) * 100 : 0);

                    let colorClass = 'bg-emerald-500 text-emerald-500';
                    let bgLightClass = 'bg-emerald-500/10 border-emerald-500/20';
                    if (pct >= 90) {
                        colorClass = 'bg-rose-500 text-rose-500';
                        bgLightClass = 'bg-rose-500/10 border-rose-500/20';
                    } else if (pct >= 70) {
                        colorClass = 'bg-amber-500 text-amber-500';
                        bgLightClass = 'bg-amber-500/10 border-amber-500/20';
                    }

                    // Top 3 Varieties
                    const varCounts: Record<string, number> = {};
                    cartons.forEach(c => {
                        varCounts[c.variety] = (varCounts[c.variety] || 0) + 1;
                    });
                    const topVars = Object.entries(varCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([v]) => v);

                    return (
                        <Card 
                            key={section.id} 
                            className="group border border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all duration-300 cursor-pointer shadow-sm relative overflow-hidden active:scale-[0.98]"
                            onClick={() => {
                                setSelectedSection({ ...section, cartons });
                                setDrawerTab('sku');
                                setDrawerSearch('');
                            }}
                        >
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${colorClass.split(' ')[0]}`} />
                            <CardContent className="p-5 pt-6 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-foreground text-sm tracking-tight group-hover:text-primary transition-colors">
                                            {section.name}
                                        </h3>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Warehouse Section</p>
                                    </div>
                                    <Badge className={`${bgLightClass} font-bold text-[10px] shadow-none border`}>
                                        {pct.toFixed(0)}% Full
                                    </Badge>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[11px] font-semibold">
                                        <span className="text-muted-foreground">Occupancy:</span>
                                        <span className="text-foreground">{occupied} / {capacity} MCs</span>
                                    </div>
                                    <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden border border-border/10">
                                        <div className={`h-full rounded-full transition-all duration-500 ${colorClass.split(' ')[0]}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-border/10 space-y-1">
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Variety Summary</span>
                                    {topVars.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {topVars.map(v => (
                                                <Badge key={v} variant="secondary" className="text-[8px] px-1.5 py-0 font-medium">
                                                    {v}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-[9px] text-muted-foreground italic block">No active cartons stored</span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {storeSections.length === 0 && (
                    <div className="col-span-full p-8 text-center text-muted-foreground italic">
                        No storage sections configured for this store.
                    </div>
                )}
            </div>

            {/* Slide-over Drawer for Section Details */}
            {selectedSection && (
                <div className="fixed inset-0 z-[150] overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 overflow-hidden">
                        <div 
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in" 
                            onClick={() => setSelectedSection(null)}
                        />

                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
                            <div className="pointer-events-auto w-screen max-w-2xl transform transition-transform duration-300 slide-in-from-right bg-background border-l border-border shadow-2xl flex flex-col h-full">
                                <div className="px-6 py-5 bg-muted/20 border-b border-border flex items-center justify-between">
                                    <div>
                                        <h2 className="text-base font-extrabold text-foreground" id="slide-over-title">
                                            {selectedSection.name} Details
                                        </h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Store: <span className="font-semibold">{selectedSection.storeName}</span>
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedSection(null)} className="rounded-full">
                                        <X size={20} />
                                    </Button>
                                </div>

                                <div className="p-6 border-b border-border bg-muted/10 grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Occupied space</span>
                                        <div className="text-xl font-black text-foreground mt-1 font-mono">
                                            {selectedSection.cartons.length} MCs
                                        </div>
                                        <span className="text-[11px] text-muted-foreground">Total Capacity: {selectedSection.capacityMcs} MCs</span>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <div className="flex justify-between text-xs text-muted-foreground font-semibold mb-1">
                                            <span>Occupancy Rate</span>
                                            <span>{((selectedSection.cartons.length / selectedSection.capacityMcs) * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden border border-border/10">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    (selectedSection.cartons.length / selectedSection.capacityMcs) * 100 >= 90 ? 'bg-rose-500' :
                                                    (selectedSection.cartons.length / selectedSection.capacityMcs) * 100 >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`} 
                                                style={{ width: `${Math.min(100, (selectedSection.cartons.length / selectedSection.capacityMcs) * 100)}%` }} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="border-b border-border flex px-6">
                                    <button
                                        onClick={() => setDrawerTab('sku')}
                                        className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all relative ${
                                            drawerTab === 'sku' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        SKU Summary Table
                                    </button>
                                    <button
                                        onClick={() => setDrawerTab('checklist')}
                                        className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all relative ${
                                            drawerTab === 'checklist' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        Carton Checklist ({selectedSection.cartons.length})
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {drawerTab === 'sku' ? (
                                        <SKUSummaryView cartons={selectedSection.cartons} />
                                    ) : (
                                        <CartonChecklistView 
                                            cartons={selectedSection.cartons} 
                                            search={drawerSearch}
                                            setSearch={setDrawerSearch}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SKUSummaryView({ cartons }: { cartons: any[] }) {
    const groups: { [key: string]: { type: string; variety: string; grade: string; count: number } } = {};
    
    cartons.forEach(c => {
        const key = `${c.type}-${c.variety}-${c.grade}`;
        if (!groups[key]) {
            groups[key] = {
                type: c.type,
                variety: c.variety,
                grade: c.grade,
                count: 0
            };
        }
        groups[key].count++;
    });

    const list = Object.values(groups).sort((a, b) => b.count - a.count);

    return (
        <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card/20">
            <Table>
                <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent bg-muted/30">
                        <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Stock Type</th>
                        <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Variety</th>
                        <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Grade</th>
                        <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Cartons</th>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {list.map((item, idx) => (
                        <TableRow key={idx} className="border-border/20 hover:bg-muted/10">
                            <TableCell className="py-3 px-4 text-xs text-foreground font-semibold">{item.type}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-foreground font-semibold">{item.variety}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-foreground">{item.grade}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-right font-bold text-primary font-mono">{item.count} MCs</TableCell>
                        </TableRow>
                    ))}
                    {list.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground italic">
                                No cartons stored in this section.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}

function CartonChecklistView({ 
    cartons, 
    search, 
    setSearch 
}: { 
    cartons: any[]; 
    search: string; 
    setSearch: (s: string) => void;
}) {
    const filtered = cartons.filter(c => {
        const query = search.toLowerCase();
        return (
            c.mc_number.toLowerCase().includes(query) ||
            (c.short_code && c.short_code.toLowerCase().includes(query)) ||
            c.variety.toLowerCase().includes(query) ||
            c.grade.toLowerCase().includes(query)
        );
    });

    return (
        <div className="space-y-4 flex flex-col h-full">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by MC, Short Code, Variety, Grade..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-background/50 border-border/60 text-xs h-9"
                />
            </div>

            <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card/20 max-h-[350px] overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent bg-muted/30">
                            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left w-12">Select</th>
                            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">MC Number</th>
                            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Short Code</th>
                            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">SKU Specs</th>
                            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Status</th>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map((c) => (
                            <TableRow key={c.mc_number} className="border-border/20 hover:bg-muted/10">
                                <TableCell className="py-2.5 px-4 text-center">
                                    <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                                </TableCell>
                                <TableCell className="py-2.5 px-4 font-mono font-semibold text-xs text-foreground">{c.mc_number}</TableCell>
                                <TableCell className="py-2.5 px-4 font-mono font-bold text-xs text-primary">{c.short_code || '---'}</TableCell>
                                <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">{c.variety}</span> | {c.grade} | {c.packing_code}
                                </TableCell>
                                <TableCell className="py-2.5 px-4 text-xs">
                                    <Badge variant={c.status === 'Available' ? 'outline' : 'secondary'} className={c.status === 'Available' ? 'border-emerald-300 text-emerald-700 bg-emerald-500/5 font-semibold text-[9px] px-1 py-0.5' : 'font-semibold text-[9px] px-1 py-0.5'}>
                                        {c.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground italic">
                                    No cartons found matching the search.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
