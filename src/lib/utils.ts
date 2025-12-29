import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Format date to YYYY-MM-DD
export function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

// Calculate days between two dates
export function daysBetween(date1: Date | string, date2: Date | string = new Date()): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Generate movement ID: MOV-yyyymmddHHMMss
export function generateMovementId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `MOV-${year}${month}${day}${hours}${minutes}${seconds}${ms}-${random}`;
}

// Generate MC Number: MC-{grade}-{packingCode}-{seq}
export function generateMCNumber(grade: string, packingCode: string, sequence: number): string {
    const gradeClean = grade.replace(/\//g, '-');
    const packingClean = packingCode.replace(/\s+/g, '').toUpperCase();
    const seq = String(sequence).padStart(4, '0');
    return `MC-${gradeClean}-${packingClean}-${seq}`;
}

// Get next sequence number for MC generation
export function getNextMCSequence(db: import('better-sqlite3').Database, grade: string, packingCode: string): number {
    const prefix = `MC-${grade.replace(/\//g, '-')}-${packingCode.replace(/\s+/g, '').toUpperCase()}-`;
    const result = db.prepare(`
    SELECT mc_number FROM fg_stock_master 
    WHERE mc_number LIKE ? 
    ORDER BY mc_number DESC 
    LIMIT 1
  `).get(`${prefix}%`) as { mc_number: string } | undefined;

    if (!result) return 1;

    const lastSeq = parseInt(result.mc_number.split('-').pop() || '0', 10);
    return lastSeq + 1;
}

// Format number with commas
export function formatNumber(num: number): string {
    return num.toLocaleString('en-IN');
}

// Parse packing code from description (e.g., "5 X 2 LBS" -> "5X2LBS")
export function packingToCode(packing: string): string {
    return packing.replace(/\s+/g, '').toUpperCase();
}
