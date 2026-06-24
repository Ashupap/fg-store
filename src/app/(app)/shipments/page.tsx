'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Truck,
    Plus,
    ArrowRight,
    Package,
    Calendar,
    CheckCircle2,
    Loader2,
    Ship,
    Search,
    X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Shipment = {
    id: number;
    po_number: string;
    customer_name: string;
    shipment_no: string;
    container_no: string;
    status: string;
    total_items: number;
    loaded_items: number;
    created_at: string;
};

type ActivePO = {
    id: number;
    po_number: string;
    customer_name: string;
    allocated_count: number;
};

export default function ShipmentPage() {
    const router = useRouter();
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [activePos, setActivePos] = useState<ActivePO[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        poId: '',
        shipmentNo: '',
        containerNo: '',
        sealNo: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [shipRes, poRes, settingsRes] = await Promise.all([
                fetch('/api/shipment/list'),
                fetch('/api/po/active'),
                fetch('/api/admin/settings')
            ]);

            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data['enable_container_planning'] !== 'true') {
                router.replace('/dashboard');
                return;
            }

            const shipData = await shipRes.json();
            const poData = await poRes.json();

            if (shipData.success) setShipments(shipData.data);
            if (poData.success) setActivePos(poData.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetch('/api/shipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    poId: parseInt(formData.poId),
                    shipmentNo: formData.shipmentNo,
                    containerNo: formData.containerNo,
                    sealNo: formData.sealNo
                })
            });

            const result = await response.json();
            if (result.success) {
                setShowCreateModal(false);
                fetchData();
                setFormData({ poId: '', shipmentNo: '', containerNo: '', sealNo: '' });
            } else {
                alert(result.error);
            }
        } catch (error) {
            alert('Failed to create shipment');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="p-6 space-y-8">
            {/* Page Title */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Shipment Planning</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Track container loadings and manage manifests</p>
            </div>

            <div className="max-w-7xl mx-auto space-y-8">
                    {/* Actions bar */}
                    <div className="flex items-center justify-between">
                        <div />
                        <Button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2"
                        >
                            <Plus size={18} />
                            New Shipment
                        </Button>
                    </div>

                    {/* Grid of Shipments */}
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin h-8 w-8 border-4 border-primary rounded-full border-t-transparent"></div>
                        </div>
                    ) : shipments.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-border rounded-xl bg-muted/20">
                            <Package size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium">No active shipments</p>
                            <p className="text-muted-foreground mb-6">Create a new shipment to start loading containers.</p>
                            <Button onClick={() => setShowCreateModal(true)}>
                                <Plus size={16} className="mr-2" />
                                Create Shipment
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {shipments.map(shipment => (
                                <Link
                                    href={`/shipments/${shipment.id}/load`}
                                    key={shipment.id}
                                    className="block group"
                                >
                                    <Card className="h-full border-border/50 bg-card/40 hover:bg-card/80 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
                                        <CardHeader className="flex flex-row items-start justify-between pb-2">
                                            <div className="p-3 bg-sky-500/10 text-sky-500 rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                                <Truck size={24} />
                                            </div>
                                            <Badge variant={
                                                shipment.status === 'Shipped' ? 'success' :
                                                    shipment.status === 'Loading' ? 'warning' : 'secondary'
                                            } className="uppercase tracking-wider text-[10px]">
                                                {shipment.status}
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div>
                                                <h3 className="font-bold text-lg leading-none mb-1 group-hover:text-primary transition-colors">{shipment.shipment_no}</h3>
                                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                    <Package size={14} />
                                                    {shipment.container_no}
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                                    <span>{shipment.loaded_items} / {shipment.total_items} MCs</span>
                                                    <span>{Math.round((shipment.loaded_items / shipment.total_items) * 100) || 0}%</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${shipment.status === 'Shipped' ? 'bg-emerald-500' : 'bg-primary'}`}
                                                        style={{ width: `${(shipment.loaded_items / shipment.total_items) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="pt-4 border-t border-border/40 flex items-center justify-between text-sm">
                                            <div className="text-muted-foreground text-xs">
                                                PO: <span className="font-medium text-foreground">{shipment.po_number}</span>
                                            </div>
                                            <div className="font-medium text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                                {shipment.status === 'Shipped' ? 'View Manifest' : 'Resume Loading'}
                                                <ArrowRight size={16} />
                                            </div>
                                        </CardFooter>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Create Modal */}
                    {showCreateModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                            <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                                <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                                    <div className="space-y-1">
                                        <CardTitle>New Shipment</CardTitle>
                                        <CardDescription>Create a new container manifest</CardDescription>
                                    </div>
                                    <Button onClick={() => setShowCreateModal(false)} variant="ghost" size="icon" className="rounded-full -mr-2">
                                        <X size={20} />
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <form onSubmit={handleCreate} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Select Purchase Order</label>
                                            <Select
                                                required
                                                value={formData.poId}
                                                onChange={e => setFormData({ ...formData, poId: e.target.value })}
                                            >
                                                <option value="">Select PO...</option>
                                                {activePos.map(po => (
                                                    <option key={po.id} value={po.id}>
                                                        {po.po_number} ({po.allocated_count} MCs)
                                                    </option>
                                                ))}
                                            </Select>
                                            {activePos.length === 0 && (
                                                <p className="text-xs text-amber-500 flex items-center gap-1">
                                                    <Loader2 className="animate-spin h-3 w-3" />
                                                    No fully allocated POs available.
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Shipment No.</label>
                                                <Input
                                                    required
                                                    type="text"
                                                    placeholder="e.g. SHIP-001"
                                                    value={formData.shipmentNo}
                                                    onChange={e => setFormData({ ...formData, shipmentNo: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Container No.</label>
                                                <Input
                                                    required
                                                    type="text"
                                                    placeholder="ABCD1234567"
                                                    value={formData.containerNo}
                                                    onChange={e => setFormData({ ...formData, containerNo: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Seal No.</label>
                                            <Input
                                                required
                                                type="text"
                                                placeholder="Seal Number"
                                                value={formData.sealNo}
                                                onChange={e => setFormData({ ...formData, sealNo: e.target.value })}
                                            />
                                        </div>

                                        <div className="pt-4 flex gap-3">
                                            <Button type="button" onClick={() => setShowCreateModal(false)} variant="outline" className="flex-1">Cancel</Button>
                                            <Button type="submit" disabled={activePos.length === 0 || submitting} className="bg-primary hover:bg-primary/90 flex-1 shadow-lg shadow-primary/20">
                                                {submitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                                                    </>
                                                ) : 'Create Shipment'}
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    )}
            </div>
        </div>
    );
}
