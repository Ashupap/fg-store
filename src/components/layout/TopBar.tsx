'use client';

import { usePathname } from 'next/navigation';
import { Menu, Bell, ChevronRight } from 'lucide-react';
import type { UserPublic } from '@/types';

interface TopBarProps {
    user: UserPublic;
    onMenuToggle: () => void;
    isCollapsed: boolean;
}

const BREADCRUMB_MAP: Record<string, string> = {
    dashboard: 'Dashboard',
    'stock-movement': 'Stock Movement',
    'po-allocation': 'PO Allocation',
    shipments: 'Shipment Planning',
    admin: 'System Admin',
    guide: 'User Guide',
    receipt: 'Receipt',
    'print-codes': 'Print Codes',
};

function getBreadcrumbs(pathname: string) {
    const segments = pathname.split('/').filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    let path = '';

    for (const segment of segments) {
        path += `/${segment}`;
        // Skip dynamic segments that look like IDs
        if (/^\d+$/.test(segment) || (segment.length > 8 && !BREADCRUMB_MAP[segment])) {
            crumbs.push({ label: '#' + segment.slice(0, 8), href: path });
        } else {
            crumbs.push({
                label: BREADCRUMB_MAP[segment] ?? segment.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                href: path,
            });
        }
    }
    return crumbs;
}

export default function TopBar({ user, onMenuToggle, isCollapsed }: TopBarProps) {
    const pathname = usePathname();
    const breadcrumbs = getBreadcrumbs(pathname);

    return (
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-border/60 flex items-center px-4 gap-4 sticky top-0 z-30">
            {/* Hamburger - mobile */}
            <button
                onClick={onMenuToggle}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all lg:hidden"
                aria-label="Toggle menu"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
                {breadcrumbs.map((crumb, i) => (
                    <div key={crumb.href} className="flex items-center gap-1.5 min-w-0">
                        {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                        <span
                            className={`truncate ${
                                i === breadcrumbs.length - 1
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted-foreground'
                            }`}
                        >
                            {crumb.label}
                        </span>
                    </div>
                ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Notification bell (placeholder) */}
                <button className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all">
                    <Bell className="w-4 h-4" />
                </button>

                {/* User badge */}
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
                    <div className="text-right">
                        <p className="text-xs font-semibold text-foreground leading-tight">{user.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize leading-tight">
                            {user.role.replace(/_/g, ' ')}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}
