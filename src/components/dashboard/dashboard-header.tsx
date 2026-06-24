'use client';

import { Download, TrendingUp, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardHeaderProps {
    exporting: boolean;
    loading: boolean;
    hasData: boolean;
    dashboardView: 'table' | 'map';
    enableMapView: boolean;
    onExport: () => void;
    onViewChange: (view: 'table' | 'map') => void;
}

export function DashboardHeader({
    exporting,
    loading,
    hasData,
    dashboardView,
    enableMapView,
    onExport,
    onViewChange,
}: DashboardHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-foreground">FG Stock Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Live inventory position across all stores</p>
            </div>
            <div className="flex items-center gap-3">
                {enableMapView && (
                    <div className="bg-muted p-1 rounded-lg flex gap-1">
                        <Button
                            variant={dashboardView === 'table' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onViewChange('table')}
                            className="h-8 px-4 text-xs font-semibold"
                        >
                            <TrendingUp size={14} className="mr-1.5" /> Table
                        </Button>
                        <Button
                            variant={dashboardView === 'map' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => onViewChange('map')}
                            className="h-8 px-4 text-xs font-semibold"
                        >
                            <Map size={14} className="mr-1.5" /> Map
                        </Button>
                    </div>
                )}
                <Button
                    onClick={onExport}
                    disabled={exporting || loading || !hasData}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                    {exporting ? <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent" /> : <Download size={16} />}
                    Export
                </Button>
            </div>
        </div>
    );
}
