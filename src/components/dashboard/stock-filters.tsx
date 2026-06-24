'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface StockFiltersProps {
    stockType: string;
    varietyFilter: string;
    gradeFilter: string;
    loading: boolean;
    onTypeChange: (type: string) => void;
    onVarietyChange: (variety: string) => void;
    onGradeChange: (grade: string) => void;
    onRefresh: () => void;
}

export function StockFilters({
    stockType,
    varietyFilter,
    gradeFilter,
    loading,
    onTypeChange,
    onVarietyChange,
    onGradeChange,
    onRefresh,
}: StockFiltersProps) {
    const [varieties, setVarieties] = useState<string[]>([]);
    const [grades, setGrades] = useState<string[]>([]);

    useEffect(() => {
        const fetchFilterOptions = async () => {
            try {
                const params = new URLSearchParams();
                if (stockType !== 'all') params.append('type', stockType);
                if (varietyFilter !== 'all') params.append('variety', varietyFilter);
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
        fetchFilterOptions();
    }, [stockType, varietyFilter]);

    const hasActiveFilters = stockType !== 'all' || varietyFilter !== 'all' || gradeFilter !== 'all';

    return (
        <div className="flex flex-wrap items-center gap-3 bg-card/40 border border-border/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1">Filters</span>
            <Select value={stockType} onChange={(e) => onTypeChange(e.target.value)} className="h-8 w-auto text-xs">
                <option value="all">All Types</option>
                <option value="IQF">IQF</option>
                <option value="SLAB">SLAB</option>
            </Select>
            <Select value={varietyFilter} onChange={(e) => onVarietyChange(e.target.value)} className="h-8 w-auto text-xs">
                <option value="all">All Varieties</option>
                {varieties.map(v => <option key={v} value={v}>{v}</option>)}
            </Select>
            <Select value={gradeFilter} onChange={(e) => onGradeChange(e.target.value)} className="h-8 w-auto text-xs">
                <option value="all">All Grades</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Button onClick={onRefresh} disabled={loading} size="sm" className="h-8 px-3 text-xs gap-1.5 ml-auto">
                {loading ? <div className="animate-spin h-3 w-3 border-2 border-current rounded-full border-t-transparent" /> : <RefreshCw size={12} />}
                Refresh
            </Button>
            {hasActiveFilters && (
                <Button
                    onClick={() => { onTypeChange('all'); onVarietyChange('all'); onGradeChange('all'); }}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs gap-1 text-muted-foreground"
                >
                    <X size={12} /> Clear
                </Button>
            )}
        </div>
    );
}
