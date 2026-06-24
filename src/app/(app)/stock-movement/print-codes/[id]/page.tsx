'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, CheckCircle2, LayoutGrid, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CartonData {
    mc_number: string;
    short_code: string | null;
    barcode: string | null;
    grade: string;
    variety: string;
    type: string;
    packing_code: string;
}

interface MovementData {
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
    remarks: string | null;
    cartons?: CartonData[];
}

export default function PrintCodesPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [data, setData] = useState<MovementData | null>(null);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [layout, setLayout] = useState<'grid' | 'large'>('grid');

    useEffect(() => {
        fetchMovementData();
        fetchSettings();
    }, [id]);

    const fetchMovementData = async () => {
        try {
            const response = await fetch(`/api/movement/${id}`);
            const result = await response.json();
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Failed to load movement data', error);
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

    if (loading) return <div className="p-8 text-center text-sm font-medium text-slate-600">Loading Codes...</div>;
    if (!data || !data.cartons || data.cartons.length === 0) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-500 font-semibold mb-4">No carton codes found for this transaction.</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    const shortCodes = data.cartons.map(c => c.short_code).filter(Boolean) as string[];
    const firstCode = shortCodes[0] || '---';
    const lastCode = shortCodes[shortCodes.length - 1] || '---';
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
                        margin: 10mm;
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
                    .print\\:hidden {
                        display: none !important;
                    }
                    .print\\:break-page {
                        page-break-after: always;
                        break-after: page;
                        page-break-inside: avoid;
                        break-inside: avoid;
                    }
                    .print\\:m-0 {
                        margin: 0 !important;
                    }
                }
            `}} />

            {/* Toolbar */}
            <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center print:hidden bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={() => router.back()} className="border-slate-200 h-9">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        <button
                            onClick={() => setLayout('grid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Grid Checklist
                        </button>
                        <button
                            onClick={() => setLayout('large')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'large' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            Large Labels
                        </button>
                    </div>
                </div>
                <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md h-9 w-full sm:w-auto font-medium">
                    <Printer className="mr-2 h-4 w-4" /> Print marking guide
                </Button>
            </div>

            {/* Container */}
            <Card className={`max-w-4xl mx-auto bg-white shadow-lg border border-slate-100 print:shadow-none print:border-none ${layout === 'large' ? 'print:bg-transparent print:p-0' : ''}`}>
                <CardContent className={`p-6 md:p-10 print:p-0 ${layout === 'large' ? 'print:p-0' : ''}`}>
                    {/* Header */}
                    <div className={`border-b-2 border-dashed border-slate-200 pb-6 mb-6 ${layout === 'large' ? 'print:hidden' : ''}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Carton Marking Guide</h1>
                                <p className="text-xs text-slate-500 mt-1">Transaction ID: <span className="font-mono font-semibold">{data.movement_id}</span></p>
                                <p className="text-xs text-slate-500">Date: {new Date(data.movement_datetime).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <span className="inline-block bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded text-xs">
                                    {data.action_type}
                                </span>
                                <p className="text-xs text-slate-500 mt-2">Store: <span className="font-semibold text-slate-700">{data.to_location}</span></p>
                            </div>
                        </div>

                        {/* Summary panel */}
                        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-wrap justify-between items-center gap-2">
                            <div className="text-xs">
                                <span className="text-slate-500">Product:</span>{' '}
                                <span className="font-semibold text-slate-700">
                                    {data.variety} | {data.grade} | {data.packing} ({data.type})
                                </span>
                            </div>
                            <div className="text-xs font-semibold text-indigo-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                                Range: {firstCode} ➔ {lastCode} ({data.qty_mcs} cartons)
                            </div>
                        </div>
                    </div>

                    {/* Instruction Alert */}
                    <div className={`mb-6 p-4 bg-amber-50/50 border border-amber-100 rounded-lg text-amber-800 flex items-start gap-3 print:hidden ${layout === 'large' ? 'print:hidden' : ''}`}>
                        <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-xs uppercase tracking-wider">Operator Instructions</h4>
                            <p className="text-xs mt-1 leading-relaxed">
                                {isBarcodeScanEnabled 
                                    ? 'Attach these barcode labels to each master carton, or scan them to verify. Check off each box in the sheet as you verify it to avoid mismatches.'
                                    : 'Write the big 3-character (or 4-character) codes clearly on each master carton using a black marker pen. Check off each box in the sheet as you mark it to avoid mismatches.'
                                }
                            </p>
                        </div>
                    </div>

                    {layout === 'grid' ? (
                        /* Grid of Codes */
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {data.cartons.map((carton, idx) => (
                                <div 
                                    key={carton.mc_number}
                                    className="border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-between text-center relative group hover:border-slate-300 transition-colors bg-white print:border-slate-300 print:break-inside-avoid"
                                >
                                    {/* Checkoff Box */}
                                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-300 group-hover:border-slate-400 print:border-slate-400">
                                        {idx + 1}
                                    </div>

                                    {/* Large Code / Barcode */}
                                    <div className="my-3 w-full flex flex-col items-center justify-center">
                                        {isBarcodeScanEnabled ? (
                                            <>
                                                <div className="font-barcode text-5xl text-slate-900 tracking-normal leading-none select-none h-12 flex items-center justify-center">
                                                    {`*${carton.barcode || carton.mc_number}*`}
                                                </div>
                                                <div className="text-[10px] text-slate-600 font-mono mt-1 font-bold select-all tracking-wider uppercase">
                                                    {carton.barcode || carton.mc_number}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-3xl font-black text-slate-900 tracking-wider font-mono">
                                                    {carton.short_code || '---'}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-mono mt-1 select-all">
                                                    {carton.mc_number}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* SKU Info */}
                                    <div className="w-full pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                                        <div>{data.variety}</div>
                                        <div className="font-semibold text-slate-700">{data.grade} • {data.packing}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Large Carton Labels (One per page on print) */
                        <div className="flex flex-col gap-6 print:gap-0 print:m-0 print:p-0">
                            {data.cartons.map((carton, idx) => (
                                <div key={carton.mc_number} className="print:break-page print:m-0 print:p-0">
                                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 md:p-12 flex flex-col items-center justify-between text-center bg-white min-h-[420px] print:h-[270mm] print:border-slate-400 print:border-4 print:rounded-none print:p-16">
                                        {/* Top Row: Info */}
                                        <div className="w-full flex justify-between items-center pb-4 border-b border-slate-100 print:border-slate-200">
                                            <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                                                {isBarcodeScanEnabled ? 'Master Carton Barcode' : 'Master Carton Serial'}
                                            </span>
                                            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full print:bg-slate-100 print:text-slate-800">
                                                Box {idx + 1} of {data.cartons?.length || 0}
                                            </span>
                                        </div>

                                        {/* Massive Code / Barcode */}
                                        <div className="my-8 flex-1 flex flex-col justify-center items-center w-full">
                                            {isBarcodeScanEnabled ? (
                                                <>
                                                    <div className="font-barcode text-7xl md:text-8xl lg:text-[7.5rem] text-slate-900 tracking-normal leading-none select-none my-4">
                                                        {`*${carton.barcode || carton.mc_number}*`}
                                                    </div>
                                                    <div className="text-md md:text-lg text-slate-700 font-mono font-bold mt-4 bg-slate-50 px-4 py-1.5 rounded-md border border-slate-100 print:border-slate-200 uppercase tracking-wider">
                                                        {carton.barcode || carton.mc_number}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-[7rem] md:text-[9rem] lg:text-[11rem] font-black text-slate-900 tracking-widest font-mono select-all leading-none">
                                                        {carton.short_code || '---'}
                                                    </div>
                                                    <div className="text-sm md:text-md text-slate-500 font-mono mt-8 bg-slate-50 px-4 py-1.5 rounded-md border border-slate-100 print:border-slate-200">
                                                        {carton.mc_number}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* SKU Bottom Row */}
                                        <div className="w-full pt-4 border-t border-slate-100 print:border-slate-200 flex flex-col md:flex-row justify-between items-center gap-2">
                                            <div className="text-left">
                                                <div className="text-xs text-slate-400 font-medium">Variety & Grade</div>
                                                <div className="text-md font-bold text-slate-800">{data.variety} ({data.grade})</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-slate-400 font-medium">Packing & Store</div>
                                                <div className="text-md font-bold text-slate-800">{data.packing} • {data.to_location}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
