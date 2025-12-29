'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Package,
    Settings,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    LogOut,
    Menu,
    Grid,
    Database,
    Boxes,
    Tag,
    ThermometerSnowflake,
    ArrowLeft,
    CheckCircle,
    AlertCircle,
    User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';

interface MasterData {
    id: number;
    value: string;
    mcs_per_fcl?: number;
}

interface StoreData {
    id: number;
    name: string;
    type: 'Processing Unit' | 'Cold Store' | 'Rented';
    location?: string;
    capacity_tons: number;
    has_loading_facility: boolean;
    is_active: boolean;
}

interface UserData {
    id: number;
    name: string;
    username: string;
    email: string;
    role: string;
    is_active: number;
    assigned_store_ids: number[];
}

const TABS = [
    { id: 'varieties', label: 'Varieties', icon: Package, description: 'Manage fruit varieties' },
    { id: 'packings', label: 'Packings', icon: Boxes, description: 'Manage packing types' },
    { id: 'grades', label: 'Grades', icon: Tag, description: 'Manage quality grades' },
    { id: 'types', label: 'Types', icon: Grid, description: 'Manage product types' },

    { id: 'stores', label: 'Stores', icon: ThermometerSnowflake, description: 'Manage processing units and cold stores' },
    { id: 'users', label: 'Users', icon: User, description: 'Manage user access and store assignments' },
    { id: 'configuration', label: 'System Config', icon: Settings, description: 'Global application settings' },
];

export default function AdminPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('varieties');
    const [data, setData] = useState<MasterData[]>([]);
    const [stores, setStores] = useState<StoreData[]>([]);
    const [users, setUsers] = useState<UserData[]>([]);
    const [settings, setSettings] = useState<{ [key: string]: string }>({});
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [currentUserRole, setCurrentUserRole] = useState<string>('');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [currentItem, setCurrentItem] = useState<MasterData | StoreData | UserData | null>(null);
    const [formData, setFormData] = useState({ value: '', mcs_per_fcl: '' });
    const [selectedStoreIds, setSelectedStoreIds] = useState<number[]>([]);

    // Store Form Data
    const [storeForm, setStoreForm] = useState<Partial<StoreData>>({
        name: '', type: 'Cold Store', location: '', capacity_tons: 0, has_loading_facility: false, is_active: true
    });

    const [userForm, setUserForm] = useState({ name: '', username: '', email: '', password: '', role: 'operator' as UserData['role'], is_active: true });

    // Fetch Settings on Mount (for Sidebar visibility and default store)
    // Secure Page: Check Auth & Fetch Settings
    useEffect(() => {
        const verifyAdminAndLoad = async () => {
            try {
                // 1. Check Auth & Role
                const authRes = await fetch('/api/auth/me');
                const authData = await authRes.json();

                if (!authData.success || !authData.user) {
                    router.push('/login'); // Not logged in
                    return;
                }

                if (authData.user.role !== 'admin' && authData.user.role !== 'general_manager') {
                    router.replace('/dashboard'); // Logged in but not authorized (Operator/Manager)
                    setToast({ type: 'error', message: 'Unauthorized: Admin access required' });
                    return;
                }

                setCurrentUserRole(authData.user.role);
                setIsAuthorized(true); // <--- Allow data fetching

                // 2. Load Global Settings (Available to both for read, though sidebar might hide Config tab)
                const response = await fetch('/api/admin/settings');
                const result = await response.json();
                if (result.success) {
                    setSettings(result.data);
                }
            } catch (err) {
                console.error("Failed to verify admin or load settings", err);
                router.push('/dashboard');
            } finally {
                // Only stop loading if we are NOT redirecting (though redirect unmounts, safer to leave it or handle specific cases)
                // actually fetchData will also run, so we need to coordinate.
                // Let's rely on the fact that if we redirect, the component unmounts. 
            }
        };
        verifyAdminAndLoad();
    }, [router]);

    const [isAuthorized, setIsAuthorized] = useState(false);

    // Fetch data when tab changes - Only if Authorized
    useEffect(() => {
        if (!isAuthorized) return;

        if (activeTab === 'configuration') {
            fetchSettings();
        } else {
            fetchData();
        }
    }, [activeTab, isAuthorized]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            // Fetch settings AND stores (for the default store dropdown)
            const [settingsRes, storesRes] = await Promise.all([
                fetch('/api/admin/settings'),
                fetch('/api/admin/stores')
            ]);

            const settingsResult = await settingsRes.json();
            const storesResult = await storesRes.json();

            if (settingsResult.success) {
                setSettings(settingsResult.data);
            }
            if (storesResult.success) {
                setStores(storesResult.data);
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Failed to fetch settings' });
        } finally {
            setLoading(false);
        }
    };

    const toggleSetting = async (key: string, currentValue: string, explicitValue?: string) => {
        const newValue = explicitValue !== undefined ? explicitValue : (currentValue === 'true' ? 'false' : 'true');
        // Optimistic update
        setSettings(prev => ({ ...prev, [key]: newValue }));

        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: newValue }),
            });
            if (response.ok) {
                setToast({ type: 'success', message: 'Setting updated' });
                // If toggling multi-store mode, refetch all settings/stores to catch backend side-effects (like auto-creating Default Store)
                if (key === 'multi_store_mode') {
                    fetchSettings();
                }
            } else {
                setSettings(prev => ({ ...prev, [key]: currentValue })); // Revert
                setToast({ type: 'error', message: 'Failed to update setting' });
            }
        } catch (err) {
            setSettings(prev => ({ ...prev, [key]: currentValue })); // Revert
            setToast({ type: 'error', message: 'Failed to update setting' });
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // If on users tab, we also need stores for the modal dropdown/lookup
            if (activeTab === 'users') {
                const [usersRes, storesRes] = await Promise.all([
                    fetch('/api/admin/users'),
                    fetch('/api/admin/stores')
                ]);
                const usersResult = await usersRes.json();
                const storesResult = await storesRes.json();

                if (usersResult.success) setUsers(usersResult.data);
                if (storesResult.success) setStores(storesResult.data);

                if (!usersResult.success) setToast({ type: 'error', message: usersResult.error });
            } else {
                const response = await fetch(`/api/admin/${activeTab}`);
                const result = await response.json();
                if (result.success) {
                    if (activeTab === 'stores') {
                        setStores(result.data);
                    } else {
                        setData(result.data);
                    }
                } else {
                    setToast({ type: 'error', message: result.error });
                }
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Failed to fetch data' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = `/api/admin/${activeTab}`;
            const method = modalMode === 'create' ? 'POST' : 'PUT';
            const body = modalMode === 'create'
                ? {
                    value: formData.value,
                    mcs_per_fcl: activeTab === 'varieties' ? parseInt(formData.mcs_per_fcl) : undefined
                }
                : {
                    oldValue: (currentItem as MasterData)?.value,
                    newValue: formData.value,
                    mcs_per_fcl: activeTab === 'varieties' ? parseInt(formData.mcs_per_fcl) : undefined
                };

            if (activeTab === 'stores') {
                const storeBody = modalMode === 'create'
                    ? storeForm
                    : { ...storeForm, id: (currentItem as StoreData).id };

                // If updating store, we use PUT with ID in URL
                const storeUrl = modalMode === 'create' ? '/api/admin/stores' : `/api/admin/stores/${(currentItem as StoreData).id}`;

                const storeResponse = await fetch(storeUrl, {
                    method: modalMode === 'create' ? 'POST' : 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(storeBody),
                });

                const storeResult = await storeResponse.json();
                if (storeResult.success) {
                    setIsModalOpen(false);
                    fetchData();
                    setToast({ type: 'success', message: 'Store saved successfully' });
                } else {
                    setToast({ type: 'error', message: storeResult.error });
                }
                return;
            }

            if (activeTab === 'users') {
                const isCreate = modalMode === 'create';
                const url = isCreate
                    ? '/api/admin/users'
                    : `/api/admin/users/${(currentItem as UserData).id}`;

                const method = isCreate ? 'POST' : 'PUT';

                const body = {
                    ...userForm,
                    assigned_store_ids: selectedStoreIds
                };

                const userResponse = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                const userResult = await userResponse.json();
                if (userResult.success) {
                    setIsModalOpen(false);
                    fetchData();
                    setToast({ type: 'success', message: isCreate ? 'User created successfully' : 'User updated successfully' });
                } else {
                    setToast({ type: 'error', message: userResult.error });
                }
                return;
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const result = await response.json();
            if (result.success) {
                setIsModalOpen(false);
                fetchData();
                setToast({ type: 'success', message: 'Record saved successfully' });
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Failed to save record' });
        }
    };

    const handleDelete = async (value: string) => {
        if (!confirm(`Are you sure you want to delete "${value}"?`)) return;

        try {
            const response = await fetch(`/api/admin/${activeTab}${activeTab === 'stores' ? '/' + (value as any) : '?value=' + encodeURIComponent(value)}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (result.success) {
                fetchData();
                setToast({ type: 'success', message: 'Record deleted' });
            } else {
                setToast({ type: 'error', message: result.error });
            }
        } catch (err) {
            setToast({ type: 'error', message: 'Failed to delete record' });
        }
    };

    const openCreateModal = () => {
        setModalMode('create');
        if (activeTab === 'stores') {
            setStoreForm({ name: '', type: 'Cold Store', location: '', capacity_tons: 0, has_loading_facility: false, is_active: true });
        } else if (activeTab === 'users') {
            setUserForm({ name: '', username: '', email: '', password: '', role: 'operator', is_active: true });
            setSelectedStoreIds([]);
        } else {
            setFormData({ value: '', mcs_per_fcl: '100' });
        }
        setIsModalOpen(true);
    };

    const openEditModal = (item: MasterData | StoreData | UserData) => {
        setModalMode('edit');
        setCurrentItem(item);

        if (activeTab === 'stores') {
            const store = item as StoreData;
            setStoreForm({
                name: store.name,
                type: store.type,
                location: store.location || '',
                capacity_tons: store.capacity_tons,
                has_loading_facility: store.has_loading_facility,
                is_active: store.is_active
            });
        } else if (activeTab === 'users') {
            const user = item as unknown as UserData;
            setUserForm({
                name: user.name,
                username: user.username || '',
                email: user.email,
                password: '', // Don't show hash
                role: user.role,
                is_active: Boolean(user.is_active)
            });
            setSelectedStoreIds(user.assigned_store_ids || []);
        } else {
            const md = item as MasterData;
            setFormData({
                value: md.value,
                mcs_per_fcl: md.mcs_per_fcl?.toString() || '100'
            });
        }
        setIsModalOpen(true);
    };

    // Auto-hide toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const activeTabData = TABS.find(t => t.id === activeTab);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header */}
            <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <ArrowLeft size={20} />
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Settings className="text-indigo-500 h-5 w-5" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">Admin Dashboard</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard">
                            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
                                <LayoutDashboard size={16} />
                                Main Dashboard
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-6 py-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">

                    {/* Sidebar Tabs */}
                    <Card className="w-full md:w-64 h-fit border-border/50 bg-card/40 sticky top-24">
                        <CardContent className="p-3 grid gap-1">
                            {TABS.map(tab => {
                                // Role-Based Tab Rendering
                                if (currentUserRole === 'general_manager') {
                                    if (tab.id === 'users' || tab.id === 'configuration') return null;
                                }

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.id
                                            ? 'bg-primary/10 text-primary shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                            }`}
                                    >
                                        <tab.icon size={18} className={activeTab === tab.id ? 'text-primary' : 'text-muted-foreground/70'} />
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </CardContent>
                    </Card>

                    {/* Content Area */}
                    <div className="flex-1 space-y-6">
                        <div className="flex justify-between items-end">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                    {activeTabData?.icon && <activeTabData.icon className="h-6 w-6 text-muted-foreground" />}
                                    {activeTabData?.label}
                                </h2>
                                <p className="text-muted-foreground mt-1">
                                    {activeTabData?.description}
                                </p>
                            </div>
                            {activeTab !== 'configuration' && (
                                <Button onClick={openCreateModal} className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                                    <Plus size={18} />
                                    Add New
                                </Button>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex justify-center items-center h-64 border border-dashed border-border rounded-xl">
                                <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                            </div>
                        ) : activeTab === 'configuration' ? (
                            <div className="grid gap-4">
                                <Card className="border-border/50 bg-card/40">
                                    <CardContent className="p-6 flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h3 className="font-medium text-16">Enable Scanning</h3>
                                            <p className="text-sm text-muted-foreground">Allow users to scan individual MC barcodes via input device during stock movements.</p>
                                        </div>
                                        <Switch
                                            checked={settings['enable_barcode_scan'] === 'true'}
                                            onCheckedChange={() => toggleSetting('enable_barcode_scan', settings['enable_barcode_scan'])}
                                        />
                                    </CardContent>
                                </Card>
                                <Card className="border-border/50 bg-card/40">
                                    <CardContent className="p-6 flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h3 className="font-medium text-16">Enable Container Planning</h3>
                                            <p className="text-sm text-muted-foreground">Enable advanced shipment creation, load planning and RFID verification workflow.</p>
                                        </div>
                                        <Switch
                                            checked={settings['enable_container_planning'] === 'true'}
                                            onCheckedChange={() => toggleSetting('enable_container_planning', settings['enable_container_planning'])}
                                        />
                                    </CardContent>
                                </Card>




                            </div>
                        ) : (
                            <Card className="border-border/50 bg-card/40 overflow-hidden">
                                <div className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-secondary/50 hover:bg-secondary/60">
                                                {activeTab === 'stores' ? (
                                                    <>
                                                        <TableHead>Store Name</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>Capacity</TableHead>
                                                        <TableHead>Loading?</TableHead>
                                                    </>
                                                ) : activeTab === 'users' ? (
                                                    <>
                                                        <TableHead>User</TableHead>
                                                        <TableHead>Role</TableHead>
                                                        <TableHead>Assigned Stores</TableHead>
                                                    </>
                                                ) : (
                                                    <>
                                                        <TableHead>Value</TableHead>
                                                        {activeTab === 'varieties' && (
                                                            <TableHead>MCs per FCL</TableHead>
                                                        )}
                                                    </>
                                                )}
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activeTab === 'stores'
                                                ? stores.map((store) => (
                                                    <TableRow key={store.id} className="hover:bg-muted/10">
                                                        <TableCell className="font-medium">{store.name}</TableCell>
                                                        <TableCell><Badge variant="outline">{store.type}</Badge></TableCell>
                                                        <TableCell>{store.capacity_tons} Tons</TableCell>
                                                        <TableCell>
                                                            {store.has_loading_facility ? (
                                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-none">Yes</Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">No</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button onClick={() => openEditModal(store)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-indigo-600">
                                                                    <Edit2 size={16} />
                                                                </Button>
                                                                <Button onClick={() => handleDelete(store.id.toString())} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                    <Trash2 size={16} />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                                : activeTab === 'users'
                                                    ? users.map((user) => (
                                                        <TableRow key={user.id} className="hover:bg-muted/10">
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium">{user.name}</span>
                                                                    <span className="text-xs text-muted-foreground">@{user.username || 'no-username'}</span>
                                                                    <span className="text-[10px] text-muted-foreground/60">{user.email}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell><Badge variant="outline" className="uppercase text-xs">{user.role}</Badge></TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {user.assigned_store_ids?.length > 0 ? (
                                                                        user.assigned_store_ids.map(sid => {
                                                                            const store = stores.find(s => s.id === sid);
                                                                            return store ? <Badge key={sid} variant="secondary" className="text-xs">{store.name}</Badge> : null;
                                                                        })
                                                                    ) : (
                                                                        <span className="text-muted-foreground text-xs italic">No Access</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <Button onClick={() => openEditModal(user)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-indigo-600">
                                                                        <Edit2 size={16} />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                    : data.map((item) => (
                                                        <TableRow key={item.id} className="hover:bg-muted/10">
                                                            <TableCell className="font-medium">
                                                                {item.value}
                                                            </TableCell>
                                                            {activeTab === 'varieties' && (
                                                                <TableCell>
                                                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                                        {item.mcs_per_fcl} MCs
                                                                    </Badge>
                                                                </TableCell>
                                                            )}
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <Button
                                                                        onClick={() => openEditModal(item)}
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-indigo-600"
                                                                    >
                                                                        <Edit2 size={16} />
                                                                    </Button>
                                                                    <Button
                                                                        onClick={() => handleDelete(item.value)}
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                            {(activeTab === 'stores' ? stores.length === 0 : data.length === 0) && (
                                                <TableRow className="hover:bg-transparent bg-muted/50">
                                                    <TableCell colSpan={activeTab === 'stores' ? 5 : (activeTab === 'varieties' ? 3 : 2)} className="h-48 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <Database className="h-8 w-8 opacity-20" />
                                                            No records found. Click "Add New" to create one.
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </main>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
                    <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                            <CardTitle className="text-xl text-foreground font-semibold">
                                {modalMode === 'create' ? 'Add New' : 'Edit'} {activeTabData?.label?.replace(/s$/, '')}
                            </CardTitle>
                            <Button onClick={() => setIsModalOpen(false)} variant="ghost" size="icon" className="rounded-full">
                                <X size={20} />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-6 overflow-y-auto">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {activeTab === 'stores' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Store Name</label>
                                            <Input
                                                required
                                                value={storeForm.name}
                                                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                                                placeholder="e.g. Unit 1"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Type</label>
                                                <Select
                                                    value={storeForm.type}
                                                    onChange={(e) => setStoreForm({ ...storeForm, type: e.target.value as any })}
                                                >
                                                    <option value="Processing Unit">Processing Unit</option>
                                                    <option value="Cold Store">Cold Store</option>
                                                    <option value="Rented">Rented</option>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Capacity (Tons)</label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={storeForm.capacity_tons}
                                                    onChange={(e) => setStoreForm({ ...storeForm, capacity_tons: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                            <div className="space-y-0.5">
                                                <label className="text-sm font-medium block">Loading Facility</label>
                                                <span className="text-xs text-muted-foreground">Can ship directly from here?</span>
                                            </div>
                                            <Switch
                                                checked={storeForm.has_loading_facility}
                                                onCheckedChange={(c) => setStoreForm({ ...storeForm, has_loading_facility: c })}
                                            />
                                        </div>
                                    </>
                                ) : activeTab === 'users' ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Full Name</label>
                                            <Input
                                                required
                                                value={userForm.name}
                                                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Username</label>
                                                <Input
                                                    required
                                                    value={userForm.username}
                                                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                                                    placeholder="jdoe"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Email Address</label>
                                                <Input
                                                    type="email"
                                                    required
                                                    value={userForm.email}
                                                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                                    placeholder="john@example.com"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">{modalMode === 'create' ? 'Initial Password' : 'New Password'}</label>
                                            <Input
                                                type="password"
                                                required={modalMode === 'create'}
                                                value={userForm.password}
                                                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                                placeholder={modalMode === 'create' ? "******" : "Leave blank to keep current"}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Role</label>
                                            <Select
                                                value={userForm.role}
                                                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                                            >
                                                <option value="operator">Operator</option>
                                                <option value="manager">Manager</option>
                                                <option value="general_manager">General Manager</option>
                                                <option value="admin">Admin</option>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Assign Stores</label>
                                            <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 max-h-60 overflow-y-auto">
                                                {stores.map(store => {
                                                    const isSingleStoreRole = userForm.role === 'operator' || userForm.role === 'manager';
                                                    return (
                                                        <label key={store.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded cursor-pointer">
                                                            <input
                                                                type={isSingleStoreRole ? "radio" : "checkbox"}
                                                                name="store_assignment" // Required for radio grouping
                                                                checked={selectedStoreIds.includes(store.id)}
                                                                onChange={(e) => {
                                                                    if (isSingleStoreRole) {
                                                                        // Single Select: Replace entire array
                                                                        setSelectedStoreIds([store.id]);
                                                                    } else {
                                                                        // Multi Select: Toggle
                                                                        if (e.target.checked) {
                                                                            setSelectedStoreIds([...selectedStoreIds, store.id]);
                                                                        } else {
                                                                            setSelectedStoreIds(selectedStoreIds.filter(id => id !== store.id));
                                                                        }
                                                                    }
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium leading-none">{store.name}</span>
                                                                <span className="text-xs text-muted-foreground">{store.type}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                                {stores.length === 0 && <p className="text-sm text-muted-foreground p-2">No stores available.</p>}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {(userForm.role === 'operator' || userForm.role === 'manager')
                                                    ? "Strict Policy: Operators and Managers can only be assigned to one store."
                                                    : "Select stores this user is authorized to access."}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                            <div className="space-y-0.5">
                                                <label className="text-sm font-medium block">Account Active</label>
                                                <span className="text-xs text-muted-foreground">Disable to suspend access</span>
                                            </div>
                                            <Switch
                                                checked={userForm.is_active}
                                                onCheckedChange={(c) => setUserForm({ ...userForm, is_active: c })}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Value</label>
                                            <Input
                                                type="text"
                                                required
                                                value={formData.value}
                                                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                                placeholder={`Enter ${activeTab.replace(/s$/, '')} name`}
                                            />
                                        </div>

                                        {activeTab === 'varieties' && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">MCs per FCL (40ft)</label>
                                                <Input
                                                    type="number"
                                                    required
                                                    min="1"
                                                    value={formData.mcs_per_fcl}
                                                    onChange={(e) => setFormData({ ...formData, mcs_per_fcl: e.target.value })}
                                                    placeholder="e.g. 100"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Usually around 100-120 MCs for 40ft container
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="pt-4 flex gap-3">
                                    <Button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        variant="secondary"
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1 bg-primary hover:bg-primary/90"
                                    >
                                        <Save size={18} className="mr-2" />
                                        Save
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {toast.message}
                </div>
            )}
        </div>
    );
}
