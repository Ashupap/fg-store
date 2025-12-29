import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { Warehouse, AlertTriangle, CheckCircle } from 'lucide-react';

interface CapacityData {
    id: number;
    name: string;
    capacityTons: number;
    usedTons: number;
    totalMCs: number;
}

export default function CapacityWidget() {
    const [data, setData] = useState<CapacityData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCapacity = async () => {
            try {
                const res = await fetch('/api/dashboard/capacity');
                const result = await res.json();
                if (result.success) {
                    setData(result.data);
                }
            } catch (err) {
                console.error('Failed to fetch capacity:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchCapacity();

        // Refresh every 5 mins
        const interval = setInterval(fetchCapacity, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return null;
    if (data.length === 0) return null; // Don't show if no stores available

    const getUtilizationColor = (pct: number) => {
        if (pct >= 90) return 'bg-red-500';
        if (pct >= 75) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    return (
        <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2 text-foreground font-bold">
                            <Warehouse size={20} className="text-primary" />
                            Store Capacity
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">Utilization based on estimated weight</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {data.map(store => {
                    const utilization = store.capacityTons > 0
                        ? (store.usedTons / store.capacityTons) * 100
                        : 0;

                    const isCritical = utilization >= 90;

                    return (
                        <div key={store.id} className="space-y-2">
                            <div className="flex justify-between items-end text-sm">
                                <div className="font-medium flex items-center gap-2">
                                    {store.name}
                                    {isCritical && <AlertTriangle size={14} className="text-red-500 animate-pulse" />}
                                </div>
                                <div className="text-muted-foreground">
                                    <span className={utilization >= 90 ? "text-red-500 font-bold" : "text-foreground"}>
                                        {utilization.toFixed(1)}%
                                    </span>
                                    <span className="mx-1">/</span>
                                    {store.usedTons.toLocaleString()} of {store.capacityTons.toLocaleString()} Tons
                                </div>
                            </div>

                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${getUtilizationColor(utilization)}`}
                                    style={{ width: `${Math.min(utilization, 100)}%` }}
                                />
                            </div>

                            <p className="text-xs text-muted-foreground text-right pl-1">
                                {store.totalMCs.toLocaleString()} MCs
                            </p>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
