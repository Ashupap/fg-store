'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ReceiptData {
    movement_id: string;
    movement_datetime: string;
    action_type: string;
    from_location: string | null;
    to_location: string;
    type: string;
    variety: string;
    packing: string;
    grade: string;
    qty_mcs: number;
    mc_numbers: string | null;
    moved_by_name: string;
    approved_by_name: string | null;
    remarks: string | null;
    status: string;
    dispatch_purpose?: string;
    po_id?: number;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [data, setData] = useState<ReceiptData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReceiptData();
    }, [id]);

    const fetchReceiptData = async () => {
        try {
            // We can reuse the movement API or fetch directly if we had a specific endpoint. 
            // Reuse GET /api/movement?limit=1&... or just create a specific one?
            // Existing GET /api/movement filters by many things. 
            // It might be easier to use GET /api/movement/pending if it was pending, but this is history.
            // Actually, we don't have a direct "Get Single Movement by ID" public API exposed easily 
            // except via the list filter or the edit/accept endpoints (internal).
            // I'll assume we can fetch it via the list API with a filter for now? 
            // Or better, since I just added GET logic in `[id]/route.ts` (wait, I added PUT).
            // I should probably add GET to `[id]/route.ts` for clean fetching.
            // But for now, let's try to fetch via the list API or just add GET to `[id]/route.ts` quickly.
            // Adding GET to `src/app/api/movement/[id]/route.ts` is cleaner.

            const response = await fetch(`/api/movement/${id}`);
            const result = await response.json();
            if (result.success) {
                setData(result.data);
                // Auto-print option?
                // setTimeout(() => window.print(), 1000);
            }
        } catch (error) {
            console.error('Failed to load receipt', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading Receipt...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Receipt not found</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:bg-white print:p-0">
            {/* Toolbar - Hidden in Print */}
            <div className="max-w-3xl mx-auto mb-6 flex justify-between items-center print:hidden">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Printer className="mr-2 h-4 w-4" /> Print Receipt
                </Button>
            </div>

            {/* Receipt Card */}
            <Card className="max-w-3xl mx-auto bg-white shadow-lg print:shadow-none print:border-none">
                <CardContent className="p-8 print:p-0">
                    {/* Header */}
                    <div className="border-b border-gray-200 pb-6 mb-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">TRANSACTION RECEIPT</h1>
                                <p className="text-sm text-muted-foreground mt-1">FG Store Management System</p>
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-sm text-gray-600">ID: <span className="font-bold text-black">{data.movement_id}</span></p>
                                <p className="text-sm text-gray-500">{new Date(data.movement_datetime).toLocaleString()}</p>
                                <div className="mt-2 inline-block px-3 py-1 rounded bg-slate-100 border border-slate-200 text-xs font-semibold">
                                    {data.action_type}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* From / To */}
                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div className="p-4 bg-slate-50 rounded border border-slate-100 print:border-gray-200">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Origin</h3>
                            {data.action_type === 'INWARD' ? (
                                <p className="font-semibold text-lg">Production</p>
                            ) : (
                                <p className="font-semibold text-lg">{data.from_location}</p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">Authorized Sender</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded border border-slate-100 print:border-gray-200">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Destination</h3>
                            <p className="font-semibold text-lg">{data.to_location}</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {data.action_type === 'DISPATCH' ? 'Client / Buyer' : 'Receiving Store'}
                            </p>
                        </div>
                    </div>

                    {/* Transaction Details */}
                    <div className="mb-8">
                        <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 mb-4">Item Details</h3>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium">
                                <tr>
                                    <th className="py-2 px-3">Description</th>
                                    <th className="py-2 px-3">Grade</th>
                                    <th className="py-2 px-3">Packing</th>
                                    <th className="py-2 px-3 text-right">Quantity (MCs)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-gray-100">
                                    <td className="py-3 px-3">
                                        <p className="font-semibold">{data.variety}</p>
                                        <p className="text-xs text-gray-500">{data.type}</p>
                                    </td>
                                    <td className="py-3 px-3">{data.grade}</td>
                                    <td className="py-3 px-3">{data.packing}</td>
                                    <td className="py-3 px-3 text-right font-bold text-lg">{data.qty_mcs}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Additional Info */}
                    <div className="grid grid-cols-2 gap-8 mb-8">
                        <div>
                            <h3 className="text-xs font-semibold text-gray-500 mb-1">Status</h3>
                            <p className="font-medium text-sm">{data.status}</p>
                        </div>
                        {data.remarks && (
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-1">Remarks</h3>
                                <p className="font-medium text-sm italic">"{data.remarks}"</p>
                            </div>
                        )}
                        <div>
                            <h3 className="text-xs font-semibold text-gray-500 mb-1">Initiated By</h3>
                            <p className="font-medium text-sm">{data.moved_by_name}</p>
                        </div>
                        {data.approved_by_name && (
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-1">Approved By</h3>
                                <p className="font-medium text-sm">{data.approved_by_name}</p>
                            </div>
                        )}
                    </div>

                    {/* Signatures Area */}
                    <div className="mt-12 pt-8 border-t border-gray-200 grid grid-cols-2 gap-12 print:mt-24">
                        <div>
                            <div className="h-16 border-b border-gray-300 border-dashed mb-2"></div>
                            <p className="text-xs text-center text-gray-500 uppercase">Authorized Signature (Sender)</p>
                        </div>
                        <div>
                            <div className="h-16 border-b border-gray-300 border-dashed mb-2"></div>
                            <p className="text-xs text-center text-gray-500 uppercase">Authorized Signature (Receiver)</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center text-xs text-gray-400 print:fixed print:bottom-4 print:left-0 print:w-full">
                        <p>Generated by FG Store System on {new Date().toLocaleString()}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
