'use client';
import { Package, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  totalMCs: number;
  availableMCs: number;
  reservedMCs: number;
  pendingPOMCs: number;
}

const stats = [
  { label: "Total MCs", key: "totalMCs" as const, icon: Package, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-l-4 border-l-blue-500" },
  { label: "Available", key: "availableMCs" as const, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-l-4 border-l-emerald-500" },
  { label: "Reserved", key: "reservedMCs" as const, icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-l-4 border-l-amber-500" },
  { label: "Pending PO", key: "pendingPOMCs" as const, icon: Package, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-l-4 border-l-purple-500" },
] as const;

export function StatsCards({ totalMCs, availableMCs, reservedMCs, pendingPOMCs }: StatsCardsProps) {
  const values = { totalMCs, availableMCs, reservedMCs, pendingPOMCs };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <Card key={i} className={`border-y-border/50 border-r-border/50 bg-card/40 ${stat.border}`}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{values[stat.key].toLocaleString()}</p>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
