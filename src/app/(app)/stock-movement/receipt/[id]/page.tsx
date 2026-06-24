'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDisplayDateTime } from '@/lib/utils';

interface CartonData {
    mc_number: string;
    short_code: string | null;
    barcode: string | null;
}

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
    allocation_strategy?: string;
    cartons?: CartonData[];
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [data, setData] = useState<ReceiptData | null>(null);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReceiptData();
        fetchSettings();
    }, [id]);

    const fetchReceiptData = async () => {
        try {
            const response = await fetch(`/api/movement/${id}`);
            const result = await response.json();
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Failed to load receipt', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await fetch('/api/admin/settings');
            const result = await response.json();
            if (result.success) {
                setSettings(result.data);
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    if (loading) return <div className="p-8 text-center">Loading Receipt...</div>;
    if (!data) return <div className="p-8 text-center text-red-500">Receipt not found</div>;

    const isBarcodeScanEnabled = settings['enable_barcode_scan'] === 'true';

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:bg-white print:p-0 print:m-0">
            <style dangerouslySetInnerHTML={{ __html: `
                @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap');
                
                .font-barcode {
                    font-family: 'Libre Barcode 39', cursive;
                }

                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 15mm;
                    }
                    body {
                        background-color: white !important;
                        color: black !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .print\\:shadow-none {
                        box-shadow: none !important;
                    }
                    .print\\:border-none {
                        border: none !important;
                        border-width: 0 !important;
                    }
                    .print\\:p-0 {
                        padding: 0 !important;
                    }
                    .print\\:bg-white {
                        background-color: white !important;
                    }
                }
            `}} />

            {/* Toolbar - Hidden in Print */}
            <div className="max-w-3xl mx-auto mb-6 flex justify-between items-center print:hidden">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                    <Printer className="mr-2 h-4 w-4" /> Print Receipt
                </Button>
            </div>

            {/* Receipt Card */}
            <Card className="max-w-3xl mx-auto bg-white shadow-xl border border-slate-100 print:shadow-none print:border-none print:bg-white">
                <CardContent className="p-8 md:p-12 print:p-0">
                    {/* Header */}
                    <div className="border-b border-slate-200 pb-6 mb-8">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest block mb-1">Official Document</span>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">STOCK RECEIPT</h1>
                                <p className="text-sm text-slate-500 mt-1">FG Store Seafood Management System</p>
                            </div>
                            <div className="text-right">
                                <p className="font-mono text-xs text-slate-500">Ref ID: <span className="font-bold text-slate-900 text-sm">{data.movement_id}</span></p>
                                <p className="text-xs text-slate-500 mt-1">{formatDisplayDateTime(data.movement_datetime)}</p>
                                <div className="mt-3 inline-block px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700 uppercase tracking-wider">
                                    {data.action_type}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* From / To */}
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 print:border-slate-200 print:bg-slate-50">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Origin</h3>
                            {data.action_type === 'INWARD' ? (
                                <p className="font-bold text-lg text-slate-800">Production Facility</p>
                            ) : (
                                <p className="font-bold text-lg text-slate-800">{data.from_location}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">Authorized Dispatcher</p>
                        </div>
                        <div className="p-5 bg-slate-50 rounded-xl border border-slate-100 print:border-slate-200 print:bg-slate-50">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Destination</h3>
                            <p className="font-bold text-lg text-slate-800">{data.to_location}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {data.action_type === 'DISPATCH' ? 'Customer Delivery' : 'Receiving Warehouse'}
                            </p>
                            {data.action_type === 'TRANSFER' && data.allocation_strategy && (
                                <p className="text-[10px] inline-block font-semibold bg-sky-100 text-sky-800 rounded px-2 py-0.5 mt-2 uppercase">
                                    Allocation: {data.allocation_strategy}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Transaction Details */}
                    <div className="mb-8">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Item Details</h3>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Description / Type</th>
                                        <th className="py-3 px-4">Grade</th>
                                        <th className="py-3 px-4">Packing Size</th>
                                        <th className="py-3 px-4 text-right">Quantity (MCs)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-white">
                                        <td className="py-4 px-4 border-b border-slate-100">
                                            <p className="font-bold text-slate-800">{data.variety}</p>
                                            <p className="text-xs text-slate-500">{data.type}</p>
                                        </td>
                                        <td className="py-4 px-4 border-b border-slate-100 text-slate-700">{data.grade}</td>
                                        <td className="py-4 px-4 border-b border-slate-100 text-slate-700">{data.packing}</td>
                                        <td className="py-4 px-4 border-b border-slate-100 text-right font-extrabold text-slate-900 text-lg">{data.qty_mcs}</td>
                                    </tr>
                                    <tr className="bg-slate-50 font-bold text-slate-800">
                                        <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider text-xs">Total Cartons:</td>
                                        <td className="py-3 px-4 text-right text-lg text-indigo-700 font-black">{data.qty_mcs} MCs</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* MC Numbers / Barcodes List */}
                    {data.cartons && data.cartons.length > 0 ? (
                        <div className="mb-8">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                {isBarcodeScanEnabled ? 'Carton Barcodes' : 'Carton MC Numbers & Marking Codes'}
                            </h3>
                            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono text-slate-600 print:bg-white print:border-slate-300">
                                {data.cartons.map((carton, idx) => (
                                    <div key={carton.mc_number} className="flex justify-between border-b border-slate-100 pb-1.5 items-center">
                                        <div className="flex flex-col">
                                            <div className="flex items-center">
                                                <span className="text-slate-400 mr-2">{idx + 1}.</span>
                                                <span className="font-semibold text-slate-800">
                                                    {isBarcodeScanEnabled ? (carton.barcode || carton.mc_number) : carton.mc_number}
                                                </span>
                                            </div>
                                            {isBarcodeScanEnabled && (
                                                <span className="font-barcode text-2xl text-slate-900 tracking-normal select-none print:text-black mt-1">
                                                    {`*${carton.barcode || carton.mc_number}*`}
                                                </span>
                                            )}
                                        </div>
                                        {carton.short_code && !isBarcodeScanEnabled && (
                                            <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px] print:bg-slate-100 print:text-slate-800">
                                                Code: {carton.short_code}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : data.mc_numbers ? (
                        <div className="mb-8">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                {isBarcodeScanEnabled ? 'Carton Barcodes' : 'Carton MC Numbers'}
                            </h3>
                            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs font-mono text-slate-600 print:bg-white print:border-slate-300">
                                {data.mc_numbers.split(',').filter(Boolean).map((mc, idx) => (
                                    <div key={mc} className="flex flex-col border-b border-slate-100 pb-1">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 mr-2">{idx + 1}.</span>
                                            <span className="font-semibold text-slate-800">{mc}</span>
                                        </div>
                                        {isBarcodeScanEnabled && (
                                            <span className="font-barcode text-2xl text-slate-900 tracking-normal select-none print:text-black mt-0.5">
                                                {`*${mc}*`}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* Additional Info */}
                    <div className="grid grid-cols-2 gap-8 mb-8 border-t border-slate-100 pt-6">
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Status</h3>
                                <p className="font-semibold text-sm text-slate-800">{data.status}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Initiated By</h3>
                                <p className="font-semibold text-sm text-slate-800">{data.moved_by_name}</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {data.remarks && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Remarks</h3>
                                    <p className="font-medium text-sm italic text-slate-600">"{data.remarks}"</p>
                                </div>
                            )}
                            {data.approved_by_name && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Approved By</h3>
                                    <p className="font-semibold text-sm text-slate-800">{data.approved_by_name}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Signatures Area */}
                    <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 gap-12 print:mt-24">
                        <div>
                            <div className="h-16 border-b border-slate-300 border-dashed mb-2"></div>
                            <p className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest">Authorized Signature (Sender)</p>
                        </div>
                        <div>
                            <div className="h-16 border-b border-slate-300 border-dashed mb-2"></div>
                            <p className="text-[10px] font-bold text-center text-slate-400 uppercase tracking-widest">Authorized Signature (Receiver)</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-12 text-center text-[10px] text-slate-400 print:mt-24">
                        <p>Generated by FG Store System on {formatDisplayDateTime(new Date())}</p>
                        <p className="mt-1 font-mono text-[9px]">Document ID: {data.movement_id}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
