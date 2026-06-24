'use client';

import { useState, useEffect } from 'react';
import { Warehouse, AlertTriangle } from 'lucide-react';

interface CapacityData {
    id: number;
    name: string;
    capacityTons: number;
    usedTons: number;
    totalMCs: number;
    type: string;
}

export default function CapacityWidget() {
    const [data, setData] = useState<CapacityData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCapacity = async () => {
            try {
                const res = await fetch('/api/dashboard/capacity');
                const result = await res.json();
                if (result.success) setData(result.data);
            } catch (err) {
                console.error('Failed to fetch capacity:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchCapacity();
        const interval = setInterval(fetchCapacity, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (loading || data.length === 0) return null;

    return (
        <div className="bg-card/40 border border-border/50 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
                <Warehouse size={16} className="text-primary" />
                <span className="text-sm font-bold text-foreground">Store Capacity</span>
                <span className="text-xs text-muted-foreground ml-auto">Utilization by weight</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {data.map(store => {
                    const pct = store.capacityTons > 0 ? (store.usedTons / store.capacityTons) * 100 : 0;
                    const isCritical = pct >= 90;
                    return (
                        <div key={store.id} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-foreground flex items-center gap-1.5">
                                    {store.name}
                                    {store.type === 'Rented' && (
                                        <span className="text-[9px] px-1 py-0.5 bg-violet-600/10 text-violet-700 font-bold rounded-full">
                                            R
                                        </span>
                                    )}
                                    {isCritical && <AlertTriangle size={11} className="text-red-500 animate-pulse" />}
                                </span>
                                <span className={`font-bold ${isCritical ? 'text-red-500' : 'text-foreground'}`}>
                                    {pct.toFixed(0)}%
                                </span>
                            </div>
                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>{store.usedTons.toLocaleString()}T</span>
                                <span>{store.totalMCs.toLocaleString()} MCs</span>
                                <span>{store.capacityTons.toLocaleString()}T</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
