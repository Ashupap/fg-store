'use client';
import { ArrowDownToLine, ArrowRightLeft, Truck, Scissors, Layers } from 'lucide-react';

type MovementType = 'INWARD' | 'TRANSFER' | 'DISPATCH' | 'REPACK_OUT' | 'REPACK_IN';

interface ActionHubProps {
  onOpenModal: (type: MovementType) => void;
}

const actions = [
  { type: 'INWARD' as const, icon: ArrowDownToLine, label: 'Inward', desc: 'Receive stock from production, generate carton codes.', color: 'emerald', badge: 'Inbound' },
  { type: 'TRANSFER' as const, icon: ArrowRightLeft, label: 'Transfer', desc: 'Move cartons between cold store warehouses.', color: 'blue', badge: 'Internal' },
  { type: 'DISPATCH' as const, icon: Truck, label: 'Dispatch', desc: 'Allocate and ship master cartons against active POs.', color: 'amber', badge: 'Outbound' },
  { type: 'REPACK_OUT' as const, icon: Scissors, label: 'Repack Out', desc: 'Initiate repacking, consume source cartons.', color: 'indigo', badge: 'Process' },
  { type: 'REPACK_IN' as const, icon: Layers, label: 'Repack In', desc: 'Complete repacking, generate new carton codes.', color: 'purple', badge: 'Process' },
];

const colorMap: Record<string, { border: string; bg: string; hoverBg: string; hoverBorder: string; iconBg: string; shadow: string; badge: string; hoverText: string }> = {
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', hoverBg: 'hover:bg-emerald-500/10', hoverBorder: 'hover:border-emerald-500/40', iconBg: 'bg-emerald-600', shadow: 'shadow-emerald-600/20', badge: 'text-emerald-600 bg-emerald-500/10', hoverText: 'group-hover:text-emerald-600' },
  blue: { border: 'border-blue-500/20', bg: 'bg-blue-500/5', hoverBg: 'hover:bg-blue-500/10', hoverBorder: 'hover:border-blue-500/40', iconBg: 'bg-blue-600', shadow: 'shadow-blue-600/20', badge: 'text-blue-600 bg-blue-500/10', hoverText: 'group-hover:text-blue-600' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', hoverBg: 'hover:bg-amber-500/10', hoverBorder: 'hover:border-amber-500/40', iconBg: 'bg-amber-600', shadow: 'shadow-amber-600/20', badge: 'text-amber-600 bg-amber-500/10', hoverText: 'group-hover:text-amber-600' },
  indigo: { border: 'border-indigo-500/20', bg: 'bg-indigo-500/5', hoverBg: 'hover:bg-indigo-500/10', hoverBorder: 'hover:border-indigo-500/40', iconBg: 'bg-indigo-600', shadow: 'shadow-indigo-600/20', badge: 'text-indigo-600 bg-indigo-50/50', hoverText: 'group-hover:text-indigo-600' },
  purple: { border: 'border-purple-500/20', bg: 'bg-purple-500/5', hoverBg: 'hover:bg-purple-500/10', hoverBorder: 'hover:border-purple-500/40', iconBg: 'bg-purple-600', shadow: 'shadow-purple-600/20', badge: 'text-purple-600 bg-purple-50/50', hoverText: 'group-hover:text-purple-600' },
};

export function ActionHub({ onOpenModal }: ActionHubProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {actions.map((action) => {
        const c = colorMap[action.color];
        const Icon = action.icon;
        return (
          <div
            key={action.type}
            onClick={() => onOpenModal(action.type)}
            className={`group relative overflow-hidden rounded-xl border ${c.border} ${c.bg} p-5 ${c.hoverBg} ${c.hoverBorder} transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-lg ${c.iconBg} text-white shadow-lg ${c.shadow}`}>
                <Icon size={20} />
              </div>
              <span className={`text-[10px] font-semibold ${c.badge} px-2 py-0.5 rounded-full`}>{action.badge}</span>
            </div>
            <div>
              <h3 className={`font-bold text-base text-foreground mb-1 ${c.hoverText} transition-colors`}>{action.label}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{action.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
