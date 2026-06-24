'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, CheckCircle2, QrCode } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDisplayDateTime } from '@/lib/utils';

interface CartonData {
    mc_number: string;
    short_code: string | null;
    barcode: string | null;
    grade: string;
    variety: string;
    type: string;
    packing_code: string;
    status: string;
    section_id: number | null;
    section_name: string | null;
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

export default function PrintMasterReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [data, setData] = useState<MovementData | null>(null);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

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

    if (loading) return <div className="p-8 text-center text-sm font-medium text-slate-600 font-sans">Loading Master Report...</div>;
    if (!data || !data.cartons || data.cartons.length === 0) {
        return (
            <div className="p-8 text-center font-sans">
                <p className="text-red-500 font-semibold mb-4">No cartons found for this transaction.</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        );
    }

    const isBarcodeScanEnabled = settings['enable_barcode_scan'] === 'true';

    // Group cartons by section
    const groupedCartons: Record<string, CartonData[]> = {};
    data.cartons.forEach(carton => {
        const sectionName = carton.section_name || 'Unassigned Section';
        if (!groupedCartons[sectionName]) {
            groupedCartons[sectionName] = [];
        }
        groupedCartons[sectionName].push(carton);
    });

    const sectionNames = Object.keys(groupedCartons).sort();

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:bg-white print:p-0 print:m-0 font-sans">
            <style dangerouslySetInnerHTML={{ __html: `
                @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap');
                
                .font-barcode {
                    font-family: 'Libre Barcode 39', cursive;
                }
                
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 15mm 10mm 15mm 10mm;
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
                <Button variant="outline" onClick={() => router.back()} className="border-slate-200 h-9">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md h-9 w-full sm:w-auto font-medium">
                    <Printer className="mr-2 h-4 w-4" /> Print Master Report
                </Button>
            </div>

            {/* Render each section group as a separate print page */}
            <div className="max-w-4xl mx-auto flex flex-col gap-8 print:gap-0">
                {sectionNames.map((sectionName, sectionIdx) => {
                    const cartons = groupedCartons[sectionName];
                    const isLast = sectionIdx === sectionNames.length - 1;

                    return (
                        <Card 
                            key={sectionName} 
                            className={`bg-white shadow-lg border border-slate-100 print:shadow-none print:border-none print:bg-white ${
                                !isLast ? 'print:break-page' : 'print:page-break-inside-avoid'
                            }`}
                        >
                            <CardContent className="p-6 md:p-10 print:p-0">
                                {/* Header */}
                                <div className="border-b-2 border-dashed border-slate-200 pb-6 mb-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Master Carton Section Report</h1>
                                                <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider print:border print:border-amber-300">
                                                    Section Attachment Report
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">Transaction ID: <span className="font-mono font-semibold">{data.movement_id}</span></p>
                                            <p className="text-xs text-slate-500">Date: {formatDisplayDateTime(data.movement_datetime)}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="inline-block bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded text-xs print:border print:border-indigo-100">
                                                {data.action_type}
                                            </span>
                                            <p className="text-xs text-slate-500 mt-2">Target Store: <span className="font-semibold text-slate-700">{data.to_location}</span></p>
                                        </div>
                                    </div>

                                    {/* Section Info Card */}
                                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 print:bg-slate-50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-600 text-white rounded-lg">
                                                <QrCode className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Storage Location</div>
                                                <div className="text-lg font-extrabold text-slate-900">{sectionName}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <div className="text-center sm:text-right">
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Carton Count</div>
                                                <div className="text-lg font-bold text-indigo-600">{cartons.length} MCs</div>
                                            </div>
                                            {/* Section Barcode */}
                                            <div className="flex flex-col items-center select-none">
                                                <div className="font-barcode text-4xl text-slate-900 tracking-normal leading-none h-10 flex items-center justify-center">
                                                    {`*SEC-${sectionName.replace(/\s+/g, '-').toUpperCase()}*`}
                                                </div>
                                                <div className="text-[8px] text-slate-500 font-mono mt-0.5 tracking-widest font-bold">
                                                    SEC-{sectionName.replace(/\s+/g, '-').toUpperCase()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Instruction Alert */}
                                <div className="mb-6 p-4 bg-amber-50/50 border border-amber-100 rounded-lg text-amber-800 flex items-start gap-3 print:bg-amber-50/30 print:border-amber-200">
                                    <CheckCircle2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-xs uppercase tracking-wider">Warehouse Placement Instructions</h4>
                                        <p className="text-xs mt-1 leading-relaxed">
                                            Paste this Master Report directly on one of the main cartons stored in <strong className="text-slate-900">{sectionName}</strong>. 
                                            Ensure all {cartons.length} cartons listed below are stacked physically in this section. Mark off each carton on the checklist as they are positioned.
                                        </p>
                                    </div>
                                </div>

                                {/* Carton Checklist Table */}
                                <div className="border border-slate-200 rounded-xl overflow-hidden print:border-slate-300">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider print:bg-slate-50">
                                                <th className="py-2.5 px-4 w-12 text-center">Verify</th>
                                                <th className="py-2.5 px-3">MC Number</th>
                                                <th className="py-2.5 px-3">Short Code</th>
                                                <th className="py-2.5 px-3">SKU Specs</th>
                                                {isBarcodeScanEnabled && <th className="py-2.5 px-3 text-right">Barcode</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 print:divide-slate-200">
                                            {cartons.map((carton) => (
                                                <tr key={carton.mc_number} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="py-3 px-4 text-center">
                                                        <div className="inline-block w-4.5 h-4.5 rounded border-2 border-slate-300 print:border-slate-400" />
                                                    </td>
                                                    <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                                                        {carton.mc_number}
                                                    </td>
                                                    <td className="py-3 px-3 font-mono text-slate-900 font-bold text-sm tracking-wider">
                                                        {carton.short_code || '---'}
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-600">
                                                        <span className="font-semibold text-slate-800">{carton.variety}</span>
                                                        <span className="mx-1.5 text-slate-300">|</span>
                                                        <span className="font-medium">{carton.grade}</span>
                                                        <span className="mx-1.5 text-slate-300">|</span>
                                                        <span>{carton.packing_code}</span>
                                                    </td>
                                                    {isBarcodeScanEnabled && (
                                                        <td className="py-2 px-3 text-right">
                                                            <div className="inline-flex flex-col items-end">
                                                                <span className="font-barcode text-3xl text-slate-900 tracking-normal leading-none">
                                                                    {`*${carton.barcode || carton.mc_number}*`}
                                                                </span>
                                                                <span className="text-[8px] text-slate-500 font-mono mt-0.5 font-bold uppercase">
                                                                    {carton.barcode || carton.mc_number}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Report Footer */}
                                <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium print:border-slate-200">
                                    <div>
                                        <span>FGStore Inventory System</span>
                                        <span className="mx-2">•</span>
                                        <span>Section {sectionName}</span>
                                    </div>
                                    <div>
                                        Page {sectionIdx + 1} of {sectionNames.length}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
