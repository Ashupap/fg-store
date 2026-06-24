'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Package,
    Settings,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    Grid,
    Database,
    Boxes,
    Tag,
    ThermometerSnowflake,
    CheckCircle,
    AlertCircle,
    User,
    Upload,
    Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils';

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
    { id: 'varieties', label: 'Varieties', icon: Package, description: 'Manage varieties' },
    { id: 'packings', label: 'Packings', icon: Boxes, description: 'Manage packing types' },
    { id: 'grades', label: 'Grades', icon: Tag, description: 'Manage quality grades' },
    { id: 'types', label: 'Types', icon: Grid, description: 'Manage product types' },

    { id: 'stores', label: 'Stores', icon: ThermometerSnowflake, description: 'Manage processing units and cold stores' },
    { id: 'sections', label: 'Store Sections', icon: Grid, description: 'Manage store storage sections and capacities' },
    { id: 'users', label: 'Users', icon: User, description: 'Manage user access and store assignments' },
    { id: 'roles', label: 'Roles', icon: Shield, description: 'Configure custom roles and permissions' },
    { id: 'configuration', label: 'System Config', icon: Settings, description: 'Global application settings' },
    { id: 'audit-logs', label: 'Audit Logs', icon: Database, description: 'Track transaction updates and system audits' },
];

const VALID_PERMISSIONS = [
    { key: '*', label: 'Superuser - Access to all actions' },
    { key: 'inward:create', label: 'Create Inward Stock' },
    { key: 'transfer:initiate', label: 'Initiate Stock Transfers' },
    { key: 'transfer:approve', label: 'Approve Stock Transfers' },
    { key: 'transfer:accept', label: 'Accept Inbound Transfers' },
    { key: 'dispatch:create', label: 'Create Dispatches' },
    { key: 'po:manage', label: 'Manage Purchase Orders' },
    { key: 'po:allocate', label: 'Allocate Stock to POs' },
    { key: 'repack:start', label: 'Initiate Repacking Jobs' },
    { key: 'repack:complete', label: 'Complete Repacking Jobs' },
    { key: 'shipment:manage', label: 'Manage Container Shipments' },
    { key: 'shipment:scan', label: 'Barcode/RFID Scan Verification' },
    { key: 'master:manage', label: 'Manage Master Data' },
    { key: 'users:manage', label: 'Manage User Accounts' },
    { key: 'settings:manage', label: 'Manage System Settings' },
    { key: 'reports:view', label: 'View Stock and Ledger Reports' },
    { key: 'transaction:update', label: 'Update Historical Transactions' },
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
    const [currentUserPermissions, setCurrentUserPermissions] = useState<string[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [roles, setRoles] = useState<any[]>([]);
    const [roleForm, setRoleForm] = useState({ name: '' });
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [sections, setSections] = useState<any[]>([]);
    const [sectionForm, setSectionForm] = useState({ storeName: '', name: '', capacityMcs: 500 });

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

                const permissions = authData.user.permissions || [];
                const isAdmin = authData.user.role === 'admin';
                const hasMaster = permissions.includes('master:manage') || permissions.includes('*');
                const hasUsers = permissions.includes('users:manage') || permissions.includes('*');
                const hasSettings = permissions.includes('settings:manage') || permissions.includes('*');

                if (!isAdmin && !hasMaster && !hasUsers && !hasSettings) {
                    router.replace('/dashboard'); // Logged in but not authorized
                    return;
                }

                setCurrentUserRole(authData.user.role);
                setCurrentUserPermissions(permissions);
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
            } else if (activeTab === 'users') {
                const [usersRes, storesRes, rolesRes] = await Promise.all([
                    fetch('/api/admin/users'),
                    fetch('/api/admin/stores'),
                    fetch('/api/admin/roles')
                ]);
                const usersResult = await usersRes.json();
                const storesResult = await storesRes.json();
                const rolesResult = await rolesRes.json();

                if (usersResult.success) setUsers(usersResult.data);
                if (storesResult.success) setStores(storesResult.data);
                if (rolesResult.success) setRoles(rolesResult.data);

                if (!usersResult.success) setToast({ type: 'error', message: usersResult.error });
            } else if (activeTab === 'roles') {
                const response = await fetch('/api/admin/roles');
                const result = await response.json();
                if (result.success) {
                    setRoles(result.data);
                } else {
                    setToast({ type: 'error', message: result.error });
                }
            } else if (activeTab === 'sections') {
                const [sectionsRes, storesRes] = await Promise.all([
                    fetch('/api/admin/sections'),
                    fetch('/api/admin/stores')
                ]);
                const sectionsResult = await sectionsRes.json();
                const storesResult = await storesRes.json();

                if (sectionsResult.success) setSections(sectionsResult.data);
                if (storesResult.success) setStores(storesResult.data);

                if (!sectionsResult.success) setToast({ type: 'error', message: sectionsResult.error });
            } else if (activeTab === 'audit-logs') {
                const response = await fetch('/api/admin/audit-logs');
                const result = await response.json();
                if (result.success) {
                    setAuditLogs(result.data);
                } else {
                    setToast({ type: 'error', message: result.error });
                }
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
 
            if (activeTab === 'roles') {
                const isCreate = modalMode === 'create';
                const url = '/api/admin/roles';
                const method = isCreate ? 'POST' : 'PUT';
 
                const body = isCreate
                    ? { name: roleForm.name, permissions: selectedPermissions }
                    : { id: (currentItem as any).id, permissions: selectedPermissions };
 
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
 
                const result = await response.json();
                if (result.success) {
                    setIsModalOpen(false);
                    fetchData();
                    setToast({ type: 'success', message: isCreate ? 'Role created successfully' : 'Role updated successfully' });
                } else {
                    setToast({ type: 'error', message: result.error });
                }
                return;
            }

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

            if (activeTab === 'sections') {
                const sectionBody = modalMode === 'create'
                    ? sectionForm
                    : { ...sectionForm, id: (currentItem as any).id };

                const sectionResponse = await fetch('/api/admin/sections', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sectionBody),
                });

                const sectionResult = await sectionResponse.json();
                if (sectionResult.success) {
                    setIsModalOpen(false);
                    fetchData();
                    setToast({ type: 'success', message: 'Section saved successfully' });
                } else {
                    setToast({ type: 'error', message: sectionResult.error });
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
            const url = activeTab === 'roles'
                ? `/api/admin/roles?id=${value}`
                : activeTab === 'sections'
                ? `/api/admin/sections?id=${value}`
                : `/api/admin/${activeTab}${activeTab === 'stores' ? '/' + (value as any) : '?value=' + encodeURIComponent(value)}`;
            const response = await fetch(url, {
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
        } else if (activeTab === 'roles') {
            setRoleForm({ name: '' });
            setSelectedPermissions([]);
        } else if (activeTab === 'sections') {
            setSectionForm({ storeName: stores[0]?.name || '', name: '', capacityMcs: 500 });
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
        } else if (activeTab === 'roles') {
            const role = item as any;
            setRoleForm({ name: role.name });
            setSelectedPermissions(role.permissions || []);
        } else if (activeTab === 'sections') {
            const sec = item as any;
            setSectionForm({
                storeName: sec.storeName,
                name: sec.name,
                capacityMcs: sec.capacityMcs
            });
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
        <div className="p-6">
            {/* Page Title */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">System Administration</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Manage master data, users, roles and system settings</p>
            </div>

            <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">

                    <Card className="w-full md:w-64 h-fit border-border/50 bg-card/40 md:sticky md:top-24">
                        <CardContent className="p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-none">
                            {TABS.map(tab => {
                                if (tab.id === 'sections' && settings['enable_location_mapping'] !== 'true') return null;

                                // Permission-Based Tab Rendering
                                const isAdmin = currentUserRole === 'admin';
                                if (!isAdmin) {
                                    if (tab.id === 'users' && !currentUserPermissions.includes('users:manage') && !currentUserPermissions.includes('*')) return null;
                                    if (tab.id === 'configuration' && !currentUserPermissions.includes('settings:manage') && !currentUserPermissions.includes('*')) return null;
                                    if (tab.id === 'stores' && !currentUserPermissions.includes('master:manage') && !currentUserPermissions.includes('*')) return null;
                                    if (tab.id === 'sections' && !currentUserPermissions.includes('master:manage') && !currentUserPermissions.includes('*')) return null;
                                    if (['varieties', 'packings', 'grades', 'types'].includes(tab.id) && !currentUserPermissions.includes('master:manage') && !currentUserPermissions.includes('*')) return null;
                                    if (tab.id === 'audit-logs' && currentUserRole !== 'general_manager') return null;
                                    if (tab.id === 'roles') return null;
                                }

                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-auto shrink-0 md:w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.id
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
                            {activeTab !== 'configuration' && activeTab !== 'audit-logs' && (
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
                                <Card className="border-border/50 bg-card/40">
                                    <CardContent className="p-6 flex items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h3 className="font-medium text-16">Enable Store Location Mapping</h3>
                                            <p className="text-sm text-muted-foreground">Divide cold stores into physical sections with capacity tracking and a live interactive layout grid.</p>
                                        </div>
                                        <Switch
                                            checked={settings['enable_location_mapping'] === 'true'}
                                            onCheckedChange={() => toggleSetting('enable_location_mapping', settings['enable_location_mapping'])}
                                        />
                                    </CardContent>
                                </Card>




                            </div>
                        ) : activeTab === 'roles' ? (
                            <Card className="border-border/50 bg-card/40 overflow-hidden">
                                <div className="p-0 overflow-x-auto w-full">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-secondary/50 hover:bg-secondary/60">
                                                <TableHead>Role Name</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Permissions</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {roles.map((role) => (
                                                <TableRow key={role.id} className="hover:bg-muted/10">
                                                    <TableCell className="font-semibold text-sm capitalize">
                                                        {role.name.replace(/_/g, ' ')}
                                                    </TableCell>
                                                    <TableCell>
                                                        {role.is_system ? (
                                                            <Badge className="bg-indigo-500/10 text-indigo-600 border-none font-medium">System Role</Badge>
                                                        ) : (
                                                            <Badge className="bg-amber-500/10 text-amber-600 border-none font-medium">Custom Role</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="max-w-md">
                                                        <div className="flex flex-wrap gap-1">
                                                            {role.permissions.includes('*') ? (
                                                                <Badge variant="secondary" className="bg-rose-500/10 text-rose-600 border-none text-[10px] font-semibold animate-pulse">ALL PERMISSIONS (*)</Badge>
                                                            ) : (
                                                                role.permissions.map((p: string) => (
                                                                    <Badge key={p} variant="outline" className="text-[10px] bg-slate-500/5 text-slate-600 border-slate-200">
                                                                        {p}
                                                                    </Badge>
                                                                ))
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!role.is_system ? (
                                                            <div className="flex justify-end gap-2">
                                                                <Button onClick={() => openEditModal(role)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-indigo-600">
                                                                    <Edit2 size={16} />
                                                                </Button>
                                                                <Button onClick={() => handleDelete(role.id.toString())} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                    <Trash2 size={16} />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic px-2">Read-Only System Role</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {roles.length === 0 && (
                                                <TableRow className="hover:bg-transparent bg-muted/50">
                                                    <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <Shield className="h-8 w-8 opacity-20" />
                                                            No roles found.
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Card>
                        ) : activeTab === 'audit-logs' ? (
                            <Card className="border-border/50 bg-card/40 overflow-hidden">
                                <div className="p-0 overflow-x-auto w-full">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-secondary/50 hover:bg-secondary/60">
                                                <TableHead>Timestamp</TableHead>
                                                <TableHead>Action</TableHead>
                                                <TableHead>Ref ID</TableHead>
                                                <TableHead>Changed By</TableHead>
                                                <TableHead>Reason</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {auditLogs.map((log) => (
                                                <TableRow key={log.id} className="hover:bg-muted/10">
                                                    <TableCell className="font-medium whitespace-nowrap text-xs">
                                                        {formatDisplayDateTime(log.timestamp)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs uppercase bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                                                            {log.action_type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">{log.record_id}</TableCell>
                                                    <TableCell className="text-xs font-medium">{log.changed_by_name}</TableCell>
                                                    <TableCell className="text-xs max-w-xs truncate italic">"{log.change_reason}"</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            onClick={() => setSelectedLog(log)}
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 border-border/50 hover:bg-muted/50 text-xs"
                                                        >
                                                            View Changes
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {auditLogs.length === 0 && (
                                                <TableRow className="hover:bg-transparent bg-muted/50">
                                                    <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <Database className="h-8 w-8 opacity-20" />
                                                            No audit logs found.
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Card>
                        ) : (
                            <Card className="border-border/50 bg-card/40 overflow-hidden">
                                <div className="p-0 overflow-x-auto w-full">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-secondary/50 hover:bg-secondary/60">
                                                {activeTab === 'sections' ? (
                                                    <>
                                                        <TableHead>Store Name</TableHead>
                                                        <TableHead>Section Name</TableHead>
                                                        <TableHead>Occupied Space</TableHead>
                                                        <TableHead>Total Capacity</TableHead>
                                                    </>
                                                ) : activeTab === 'stores' ? (
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
                                            {activeTab === 'sections'
                                                ? sections.map((sec) => (
                                                    <TableRow key={sec.id} className="hover:bg-muted/10">
                                                        <TableCell className="font-semibold text-sm">{sec.storeName}</TableCell>
                                                        <TableCell className="font-medium text-sm">{sec.name}</TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Badge className={
                                                                    sec.occupied >= sec.capacityMcs ? 'bg-rose-500/10 text-rose-600 border-none' :
                                                                    sec.occupied >= sec.capacityMcs * 0.9 ? 'bg-amber-500/10 text-amber-600 border-none' :
                                                                    'bg-emerald-500/10 text-emerald-600 border-none'
                                                                }>
                                                                    {sec.occupied} MCs
                                                                </Badge>
                                                                <span className="text-xs text-muted-foreground">({Math.round(sec.occupied / sec.capacityMcs * 100)}%)</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm">{sec.capacityMcs} MCs</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button onClick={() => openEditModal(sec)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-indigo-600">
                                                                    <Edit2 size={16} />
                                                                </Button>
                                                                <Button onClick={() => handleDelete(sec.id.toString())} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                    <Trash2 size={16} />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                                : activeTab === 'stores'
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
                                            {(activeTab === 'stores' ? stores.length === 0 : activeTab === 'sections' ? sections.length === 0 : data.length === 0) && (
                                                <TableRow className="hover:bg-transparent bg-muted/50">
                                                    <TableCell colSpan={activeTab === 'stores' || activeTab === 'sections' ? 5 : (activeTab === 'varieties' ? 3 : 2)} className="h-48 text-center text-muted-foreground">
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
                                {activeTab === 'sections' ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Store Name</label>
                                            <Select
                                                value={sectionForm.storeName}
                                                onChange={(e) => setSectionForm({ ...sectionForm, storeName: e.target.value })}
                                            >
                                                {stores.map(store => (
                                                    <option key={store.id} value={store.name}>
                                                        {store.name}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Section Name</label>
                                            <Input
                                                required
                                                value={sectionForm.name}
                                                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                                                placeholder="e.g. Chamber A or Row 1"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Maximum Capacity (MCs)</label>
                                            <Input
                                                type="number"
                                                required
                                                min="1"
                                                value={sectionForm.capacityMcs}
                                                onChange={(e) => setSectionForm({ ...sectionForm, capacityMcs: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                ) : activeTab === 'stores' ? (
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
                                                {roles.map(r => (
                                                    <option key={r.id} value={r.name} className="capitalize">
                                                        {r.name.replace(/_/g, ' ')}
                                                    </option>
                                                ))}
                                                {roles.length === 0 && (
                                                    <>
                                                        <option value="operator">Operator</option>
                                                        <option value="manager">Manager</option>
                                                        <option value="general_manager">General Manager</option>
                                                        <option value="admin">Admin</option>
                                                    </>
                                                )}
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
                                ) : activeTab === 'roles' ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Role Name</label>
                                            <Input
                                                required
                                                disabled={modalMode === 'edit'}
                                                value={roleForm.name}
                                                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                                                placeholder="e.g. quality_inspector"
                                            />
                                            {modalMode === 'edit' && (
                                                <p className="text-xs text-muted-foreground italic">Role names of existing roles cannot be changed.</p>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium block">Configure Permissions</label>
                                            <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 max-h-60 overflow-y-auto bg-slate-50/50">
                                                {VALID_PERMISSIONS.map(permission => (
                                                    <label key={permission.key} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded cursor-pointer transition-colors duration-150">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPermissions.includes(permission.key) || selectedPermissions.includes('*')}
                                                            disabled={selectedPermissions.includes('*') && permission.key !== '*'}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedPermissions([...selectedPermissions, permission.key]);
                                                                } else {
                                                                    setSelectedPermissions(selectedPermissions.filter(k => k !== permission.key));
                                                                }
                                                            }}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-semibold text-foreground leading-none">{permission.key}</span>
                                                            <span className="text-[10px] text-muted-foreground mt-0.5">{permission.label}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
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

            {/* Audit Log Detail Modal */}
            {selectedLog && (
                 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
                     <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                         <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                             <div>
                                 <CardTitle className="text-xl text-foreground font-semibold flex items-center gap-2">
                                     <Database className="h-5 w-5 text-indigo-500" />
                                     Audit Log Detail
                                 </CardTitle>
                                 <CardDescription className="text-xs mt-1">
                                     ID: {selectedLog.id} | Timestamp: {formatDisplayDateTime(selectedLog.timestamp)}
                                 </CardDescription>
                             </div>
                             <Button onClick={() => setSelectedLog(null)} variant="ghost" size="icon" className="rounded-full">
                                 <X size={20} />
                             </Button>
                         </CardHeader>
                         <CardContent className="p-6 overflow-y-auto space-y-6">
                             {/* Metadata */}
                             <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg border border-border/50 text-sm">
                                 <div>
                                     <span className="text-muted-foreground block text-xs">Changed By</span>
                                     <span className="font-semibold text-foreground">{selectedLog.changed_by_name} (ID: {selectedLog.changed_by_id})</span>
                                 </div>
                                 <div>
                                     <span className="text-muted-foreground block text-xs">Reason for Change</span>
                                     <span className="font-semibold text-foreground italic">"{selectedLog.change_reason}"</span>
                                 </div>
                             </div>

                             {/* Side-by-side or table diff */}
                             {(() => {
                                 let before: any = null;
                                 let after: any = null;
                                 try { before = JSON.parse(selectedLog.before_state); } catch(e){}
                                 try { after = JSON.parse(selectedLog.after_state); } catch(e){}

                                 if (!before || !after) {
                                     return <p className="text-sm text-destructive">Error: Could not parse state data.</p>;
                                 }

                                 const compareFields = [
                                     { label: 'Movement Date', getVal: (s: any) => formatDisplayDate(s.log?.movement_datetime) },
                                     { label: 'Action Type', getVal: (s: any) => s.log?.action_type || 'N/A' },
                                     { label: 'From Store', getVal: (s: any) => s.log?.from_location || 'N/A' },
                                     { label: 'To Store', getVal: (s: any) => s.log?.to_location || 'N/A' },
                                     { label: 'Variety', getVal: (s: any) => s.log?.variety || 'N/A' },
                                     { label: 'Packing', getVal: (s: any) => s.log?.packing || 'N/A' },
                                     { label: 'Grade', getVal: (s: any) => s.log?.grade || 'N/A' },
                                     { label: 'Qty (MCs)', getVal: (s: any) => s.log?.qty_mcs?.toString() || '0' },
                                     { label: 'Remarks', getVal: (s: any) => s.log?.remarks || 'N/A' },
                                     { label: 'PO ID', getVal: (s: any) => s.log?.po_id?.toString() || 'N/A' },
                                 ];

                                 return (
                                     <div className="space-y-4">
                                         <h4 className="font-semibold text-sm text-indigo-500 uppercase tracking-wider font-medium">Transaction Differences</h4>
                                         <div className="border border-border/50 rounded-lg overflow-hidden">
                                             <Table>
                                                 <TableHeader>
                                                     <TableRow className="bg-muted/40">
                                                         <TableHead className="w-1/3">Field</TableHead>
                                                         <TableHead className="w-1/3">Before (Previous State)</TableHead>
                                                         <TableHead className="w-1/3">After (New State)</TableHead>
                                                     </TableRow>
                                                 </TableHeader>
                                                 <TableBody>
                                                     {compareFields.map(f => {
                                                         const valBefore = f.getVal(before);
                                                         const valAfter = f.getVal(after);
                                                         const isDifferent = valBefore !== valAfter;

                                                         return (
                                                             <TableRow key={f.label} className="hover:bg-transparent">
                                                                 <TableCell className="font-medium text-xs">{f.label}</TableCell>
                                                                 <TableCell className={`text-xs ${isDifferent ? 'bg-red-500/10 text-red-500 font-medium' : 'text-muted-foreground'}`}>
                                                                     {valBefore}
                                                                 </TableCell>
                                                                 <TableCell className={`text-xs ${isDifferent ? 'bg-emerald-500/10 text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
                                                                     {valAfter}
                                                                 </TableCell>
                                                             </TableRow>
                                                         );
                                                     })}
                                                 </TableBody>
                                             </Table>
                                         </div>

                                         {/* MC numbers check */}
                                         {before.log?.mc_numbers !== after.log?.mc_numbers && (
                                             <div className="space-y-2">
                                                 <h4 className="font-semibold text-sm text-indigo-500 uppercase tracking-wider font-medium">Carton MC List Update</h4>
                                                 <div className="grid grid-cols-2 gap-4 text-xs">
                                                     <div className="p-3 border rounded-lg bg-red-500/5 max-h-40 overflow-y-auto">
                                                         <span className="text-red-500 font-semibold block mb-1">Before MCs ({before.log?.mc_numbers?.split(',').filter(Boolean).length || 0})</span>
                                                         <div className="font-mono break-all text-muted-foreground/80 leading-relaxed">
                                                             {before.log?.mc_numbers || 'None'}
                                                         </div>
                                                     </div>
                                                     <div className="p-3 border rounded-lg bg-emerald-500/5 max-h-40 overflow-y-auto">
                                                         <span className="text-emerald-600 font-semibold block mb-1">After MCs ({after.log?.mc_numbers?.split(',').filter(Boolean).length || 0})</span>
                                                         <div className="font-mono break-all text-muted-foreground/80 leading-relaxed">
                                                             {after.log?.mc_numbers || 'None'}
                                                         </div>
                                                     </div>
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 );
                             })()}
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
