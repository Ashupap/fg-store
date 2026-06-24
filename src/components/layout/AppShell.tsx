'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { UserPublic } from '@/types';

interface AppShellProps {
    user: UserPublic;
    settings: Record<string, string>;
    children: React.ReactNode;
}

export default function AppShell({ user, settings, children }: AppShellProps) {
    const router = useRouter();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout request failed:', error);
        }
        window.location.href = '/login';
    }, []);

    const sidebarWidth = isCollapsed ? 'lg:pl-16' : 'lg:pl-60';

    return (
        <div className="min-h-screen bg-slate-50">
            <Sidebar
                user={user}
                settings={settings}
                isOpen={isMobileOpen}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => setIsCollapsed((c) => !c)}
                onCloseMobile={() => setIsMobileOpen(false)}
                onLogout={handleLogout}
            />

            {/* Main content area shifts with sidebar */}
            <div className={`flex flex-col min-h-screen transition-all duration-300 ${sidebarWidth}`}>
                <TopBar
                    user={user}
                    onMenuToggle={() => setIsMobileOpen((o) => !o)}
                    isCollapsed={isCollapsed}
                />

                <main className="flex-1 overflow-x-hidden">
                    <div className="h-full">
                        {children}
                    </div>
                </main>

                {/* Footer */}
                <footer className="border-t border-border/40 py-3 px-6 flex items-center justify-between bg-white/50">
                    <p className="text-xs text-muted-foreground">
                        Marine Flow FG Store ERP — v2.0
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Built with ❤️ in India
                    </p>
                </footer>
            </div>
        </div>
    );
}
