import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import AppShell from '@/components/layout/AppShell';

export const dynamic = 'force-dynamic';

async function getSettings(): Promise<Record<string, string>> {
    try {
        const db = getDb();
        const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    } catch {
        return {};
    }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/login');
    }

    const settings = await getSettings();

    return (
        <AppShell user={user} settings={settings}>
            {children}
        </AppShell>
    );
}
