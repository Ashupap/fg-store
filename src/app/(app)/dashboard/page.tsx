'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DashboardRow } from '@/types';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { StockFilters } from '@/components/dashboard/stock-filters';
import { StockTable } from '@/components/dashboard/stock-table';
import { WarehouseGridMap } from '@/components/dashboard/warehouse-grid-map';
import { DashboardSkeleton } from '@/components/ui/page-skeletons';
import { formatDisplayDate } from '@/lib/utils';
import CapacityWidget from '@/components/dashboard/CapacityWidget';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.user) {
                    if (data.user.role === 'operator') {
                        router.replace('/stock-movement');
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

    // Filter state
    const [stockType, setStockType] = useState('all');
    const [varietyFilter, setVarietyFilter] = useState('all');
    const [gradeFilter, setGradeFilter] = useState('all');

    // Dashboard data via React Query
    const { data: dashboardResult, isLoading: loading, refetch } = useQuery({
        queryKey: ['dashboard', { type: stockType, variety: varietyFilter, grade: gradeFilter }],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (stockType !== 'all') params.append('type', stockType);
            if (varietyFilter !== 'all') params.append('variety', varietyFilter);
            if (gradeFilter !== 'all') params.append('grade', gradeFilter);
            const res = await fetch(`/api/dashboard?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch dashboard');
            return res.json();
        },
    });

    const data: DashboardRow[] = dashboardResult?.success ? dashboardResult.data : [];
    const error: string | null = dashboardResult?.error ?? null;

    // Totals
    const totals = data.reduce((acc, row) => ({
        totalMCs: acc.totalMCs + row.totalMCs,
        availableMCs: acc.availableMCs + row.availableMCs,
        reservedMCs: acc.reservedMCs + row.reservedMCs,
        allocatedMCs: acc.allocatedMCs + row.allocatedMCs,
        pendingPOMCs: acc.pendingPOMCs + row.pendingPOMCs,
    }), { totalMCs: 0, availableMCs: 0, reservedMCs: 0, allocatedMCs: 0, pendingPOMCs: 0 });

    // Export
    const [exporting, setExporting] = useState(false);
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
        } catch {
            alert('Export failed');
        } finally {
            setExporting(false);
        }
    };

    // Filter handlers
    const handleTypeChange = (newType: string) => {
        setStockType(newType);
        setVarietyFilter('all');
        setGradeFilter('all');
    };
    const handleVarietyChange = (newVariety: string) => {
        setVarietyFilter(newVariety);
        setGradeFilter('all');
    };

    // Map state
    const [dashboardView, setDashboardView] = useState<'table' | 'map'>('table');
    const [sections, setSections] = useState<any[]>([]);
    const [activeStock, setActiveStock] = useState<any[]>([]);
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [selectedSection, setSelectedSection] = useState<any | null>(null);
    const [drawerSearch, setDrawerSearch] = useState('');
    const [drawerTab, setDrawerTab] = useState<'sku' | 'checklist'>('sku');

    const fetchMapData = async () => {
        try {
            const [sectionsRes, stockRes] = await Promise.all([
                fetch('/api/admin/sections'),
                fetch('/api/stock/locate?limit=none'),
            ]);
            const [sectionsData, stockData] = await Promise.all([sectionsRes.json(), stockRes.json()]);
            if (sectionsData.success) {
                setSections(sectionsData.data);
                if (sectionsData.data.length > 0 && !selectedStore) setSelectedStore(sectionsData.data[0].storeName);
            }
            if (stockData.success) setActiveStock(stockData.data);
        } catch (err) {
            console.error('Failed to load map data:', err);
        }
    };

    // Settings
    const [settings, setSettings] = useState<any>({});
    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => { if (data.success) setSettings(data.data); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (dashboardView === 'map') fetchMapData();
    }, [dashboardView]);

    useEffect(() => {
        if (settings['enable_location_mapping'] !== 'true' && dashboardView === 'map') {
            setDashboardView('table');
        }
    }, [settings, dashboardView]);

    if (authLoading || loading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="p-6 space-y-5 max-w-[1600px] mx-auto">
            {/* 1. Header with view toggle + export */}
            <DashboardHeader
                exporting={exporting}
                loading={loading}
                hasData={data.length > 0}
                dashboardView={dashboardView}
                enableMapView={settings['enable_location_mapping'] === 'true'}
                onExport={handleExport}
                onViewChange={setDashboardView}
            />

            {/* 2. Stats row */}
            <StatsCards
                totalMCs={totals.totalMCs}
                availableMCs={totals.availableMCs}
                reservedMCs={totals.reservedMCs}
                pendingPOMCs={totals.pendingPOMCs}
            />

            {/* 3. Capacity — full width */}
            <CapacityWidget />

            {/* 4. Filters toolbar — only in table view */}
            {dashboardView === 'table' && (
                <StockFilters
                    stockType={stockType}
                    varietyFilter={varietyFilter}
                    gradeFilter={gradeFilter}
                    loading={loading}
                    onTypeChange={handleTypeChange}
                    onVarietyChange={handleVarietyChange}
                    onGradeChange={setGradeFilter}
                    onRefresh={() => refetch()}
                />
            )}

            {/* 5. Main content — table or map */}
            {dashboardView === 'table' ? (
                <StockTable
                    data={data}
                    error={error}
                    loading={loading}
                    totals={totals}
                    onRetry={() => refetch()}
                />
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
    );
}
