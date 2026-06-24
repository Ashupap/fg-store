'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    TrendingUp,
    Truck,
    Settings,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Ship,
    Menu,
    X,
    Snowflake,
} from 'lucide-react';
import type { UserPublic } from '@/types';

interface NavItem {
    href: string;
    label: string;
    icon: React.ElementType;
    section: string;
    roles: string[];
    requiresSetting?: string;
}

const NAV_ITEMS: NavItem[] = [
    {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        section: 'Overview',
        roles: ['operator'],
    },
    {
        href: '/stock-movement',
        label: 'Stock Movement',
        icon: Package,
        section: 'Operations',
        roles: ['admin', 'general_manager', 'manager', 'operator'],
    },
    {
        href: '/po-allocation',
        label: 'PO Allocation',
        icon: TrendingUp,
        section: 'Operations',
        roles: ['admin', 'general_manager', 'marketing_manager'],
    },
    {
        href: '/shipments',
        label: 'Shipment Planning',
        icon: Truck,
        section: 'Logistics',
        roles: ['admin', 'general_manager'],
        requiresSetting: 'enable_container_planning',
    },
    {
        href: '/admin',
        label: 'System Admin',
        icon: Settings,
        section: 'Administration',
        roles: ['admin', 'general_manager'],
    },
    {
        href: '/guide',
        label: 'User Guide',
        icon: BookOpen,
        section: 'Support',
        roles: ['admin', 'general_manager', 'manager', 'operator', 'marketing_manager'],
    },
];

interface SidebarProps {
    user: UserPublic;
    settings: Record<string, string>;
    isOpen: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onCloseMobile: () => void;
    onLogout: () => void;
}

export default function Sidebar({
    user,
    settings,
    isOpen,
    isCollapsed,
    onToggleCollapse,
    onCloseMobile,
    onLogout,
}: SidebarProps) {
    const pathname = usePathname();

    const filteredItems = NAV_ITEMS.filter((item) => {
        // Check role
        if (!item.roles.includes(user.role)) return false;
        // Check setting if required
        if (item.requiresSetting && settings[item.requiresSetting] !== 'true') return false;
        return true;
    });

    // Group by section
    const sections = filteredItems.reduce<Record<string, NavItem[]>>((acc, item) => {
        if (!acc[item.section]) acc[item.section] = [];
        acc[item.section].push(item);
        return acc;
    }, {});

    const roleLabels: Record<string, string> = {
        admin: 'Administrator',
        general_manager: 'General Manager',
        manager: 'Store Manager',
        operator: 'Operator',
        marketing_manager: 'Marketing Manager',
    };

    const initials = user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={onCloseMobile}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed top-0 left-0 z-50 h-full flex flex-col
                    bg-sidebar border-r border-sidebar-border
                    transition-all duration-300 ease-in-out
                    ${isCollapsed ? 'w-16' : 'w-60'}
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Desktop collapse toggle - Floating on right border */}
                <button
                    onClick={onToggleCollapse}
                    className="absolute top-5 -right-3 z-50 w-6 h-6 rounded-full border border-sidebar-border bg-sidebar hover:bg-sidebar-hover text-sidebar-muted hover:text-sidebar-foreground hidden lg:flex items-center justify-center shadow-md transition-all duration-200 cursor-pointer"
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronLeft className="w-3.5 h-3.5" />
                    )}
                </button>

                {/* Brand Header */}
                <div className={`flex items-center h-16 px-3 border-b border-sidebar-border shrink-0 ${isCollapsed ? 'justify-center' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_12px_rgba(46,139,87,0.3)]">
                            <Ship className="w-5 h-5 text-primary" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <span className="font-bold text-sm text-sidebar-foreground tracking-tight block">Marine Flow</span>
                                <span className="text-[10px] text-sidebar-muted tracking-wider uppercase">FG Store ERP</span>
                            </div>
                        )}
                    </div>
 
                    {/* Mobile close */}
                    <button
                        onClick={onCloseMobile}
                        className="ml-auto p-1 text-sidebar-muted hover:text-sidebar-foreground rounded-lg transition-colors lg:hidden"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
 
                {/* Navigation */}
                <nav className={`flex-1 overflow-y-auto py-4 px-2 space-y-1 ${isCollapsed ? 'scrollbar-none' : 'scrollbar-thin'}`}>
                    {Object.entries(sections).map(([section, items]) => (
                        <div key={section} className="mb-2">
                            {!isCollapsed && (
                                <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-sidebar-muted mb-1">
                                    {section}
                                </p>
                            )}
                            {isCollapsed && <div className="my-2 border-t border-sidebar-border/40 mx-2" />}
                            <div className="space-y-0.5">
                                {items.map((item) => {
                                    const isActive =
                                        pathname === item.href ||
                                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onCloseMobile}
                                            title={isCollapsed ? item.label : undefined}
                                            className={`
                                                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                                                transition-all duration-150 group relative
                                                ${isCollapsed ? 'justify-center' : ''}
                                                ${isActive
                                                    ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(46,139,87,0.2)]'
                                                    : 'text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground'
                                                }
                                            `}
                                        >
                                            {/* Active indicator */}
                                            {isActive && (
                                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                                            )}

                                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-sidebar-muted group-hover:text-sidebar-foreground'} transition-colors`} />

                                            {!isCollapsed && (
                                                <span className="truncate">{item.label}</span>
                                            )}

                                            {/* Tooltip when collapsed */}
                                            {isCollapsed && (
                                                <span className="absolute left-full ml-3 px-2 py-1 bg-popover border border-border rounded-lg text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg z-50">
                                                    {item.label}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User Card */}
                <div className="shrink-0 border-t border-sidebar-border p-3">
                    {isCollapsed ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                                {initials}
                            </div>
                            <button
                                onClick={onLogout}
                                title="Logout"
                                className="p-1.5 text-sidebar-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-1">
                            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name}</p>
                                <p className="text-[10px] text-sidebar-muted truncate">
                                    {roleLabels[user.role] ?? user.role}
                                </p>
                            </div>
                            <button
                                onClick={onLogout}
                                title="Logout"
                                className="shrink-0 p-1.5 text-sidebar-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
