import * as XLSX from 'xlsx';
import type { DashboardRow } from '@/types';

export function exportDashboardToExcel(data: DashboardRow[]): Buffer {
    // Prepare data for Excel
    const worksheetData = data.map(row => ({
        'Grade': row.grade,
        'Packing Code': row.packingCode,
        'Packing Description': row.packingDescription,
        'Total MCs': row.totalMCs,
        'Available MCs': row.availableMCs,
        'Reserved MCs': row.reservedMCs,
        'Allocated MCs': row.allocatedMCs,
        'Pending PO MCs': row.pendingPOMCs,
        'MCs per FCL': row.mcsPerFCL,
        'FCL 40ft': row.fcl40ft.toFixed(2),
        'Oldest Stock Date': row.oldestPackingDate || 'N/A',
        'Days Aging': row.daysAging,
    }));

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);

    // Set column widths
    worksheet['!cols'] = [
        { wch: 10 },  // Grade
        { wch: 12 },  // Packing Code
        { wch: 20 },  // Packing Description
        { wch: 10 },  // Total MCs
        { wch: 12 },  // Available MCs
        { wch: 12 },  // Reserved MCs
        { wch: 12 },  // Allocated MCs
        { wch: 14 },  // Pending PO MCs
        { wch: 12 },  // MCs per FCL
        { wch: 10 },  // FCL 40ft
        { wch: 16 },  // Oldest Stock Date
        { wch: 12 },  // Days Aging
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FG Stock Dashboard');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return buffer;
}

export function generateExcelFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    return `FG_Stock_Dashboard_${dateStr}.xlsx`;
}
