'use client';

import { useState, Fragment } from 'react';
import { ChevronRight, AlertCircle, Snowflake } from 'lucide-react';
import type { DashboardRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';

interface StockTableProps {
    data: DashboardRow[];
    error: string | null;
    loading: boolean;
    totals: {
        totalMCs: number;
        availableMCs: number;
        reservedMCs: number;
        allocatedMCs: number;
        pendingPOMCs: number;
    };
    onRetry: () => void;
}

export function StockTable({ data, error, loading, totals, onRetry }: StockTableProps) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    return (
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
                <CardTitle className="text-lg flex items-center gap-2 font-bold text-foreground">
                    <Snowflake className="h-5 w-5 text-primary" />
                    Live Stock Position
                </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
                {error ? (
                    <div className="p-12 text-center text-destructive">
                        <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">{error}</p>
                        <Button onClick={onRetry} variant="outline" className="mt-4">Try Again</Button>
                    </div>
                ) : loading ? (
                    <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                        <div className="animate-spin h-10 w-10 border-4 border-primary rounded-full border-t-transparent mb-4" />
                        <p>Loading inventory data...</p>
                    </div>
                ) : data.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <Snowflake className="mx-auto h-12 w-12 mb-4 opacity-20" />
                        <h3 className="text-lg font-medium">No Stock Found</h3>
                        <p className="text-sm opacity-70">Try adjusting your filters or add new stock.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto w-full">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-100 hover:bg-slate-100 border-border/40">
                                    <TableHead className="font-semibold text-slate-700">Variety</TableHead>
                                    <TableHead className="font-semibold text-slate-700">Grade</TableHead>
                                    <TableHead className="font-semibold text-slate-700">Packing</TableHead>
                                    <TableHead className="text-right font-semibold text-slate-700">Available MCs</TableHead>
                                    <TableHead className="text-right font-semibold text-slate-700">FCL</TableHead>
                                    <TableHead className="text-right font-semibold text-slate-700">Aging</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((row, index) => {
                                    const rowKey = `${row.variety}-${row.grade}-${row.packingCode}-${index}`;
                                    const isExpanded = expandedRow === rowKey;

                                    return (
                                        <Fragment key={rowKey}>
                                            <TableRow
                                                className="border-border/40 hover:bg-muted/30 cursor-pointer"
                                                onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                                            >
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="font-normal">{row.variety}</Badge>
                                                        {row.storeBreakdown && row.storeBreakdown.length > 0 && (
                                                            <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                                                <ChevronRight size={16} className="text-muted-foreground" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">{row.grade}</TableCell>
                                                <TableCell className="text-muted-foreground">{row.packingCode}</TableCell>
                                                <TableCell className="text-right">
                                                    <span className="font-bold text-emerald-500">{row.availableMCs.toLocaleString()}</span>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                                    {row.fcl40ft.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {row.daysAging > 30 ? (
                                                        <Badge variant="destructive" className="bg-red-500/15 text-red-500 hover:bg-red-500/25 border-0">
                                                            {row.daysAging}d
                                                        </Badge>
                                                    ) : row.daysAging > 14 ? (
                                                        <Badge variant="warning" className="border-0">
                                                            {row.daysAging}d
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">{row.daysAging}d</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            {isExpanded && row.storeBreakdown && (
                                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                    <TableCell colSpan={6} className="p-4">
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            {row.storeBreakdown.map((store, i) => (
                                                                <div key={i} className="flex justify-between items-center bg-background/50 p-2 rounded-lg border border-border/50">
                                                                    <span className="text-sm font-medium text-muted-foreground">{store.store}</span>
                                                                    <span className="text-sm font-bold">{store.count.toLocaleString()} <span className="text-xs font-normal opacity-70">MCs</span></span>
                                                                </div>
                                                            ))}
                                                            {row.storeBreakdown.length === 0 && (
                                                                <span className="text-sm text-muted-foreground italic">No store details available</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </TableBody>
                            <TableFooter className="bg-muted/50 border-t border-border/40">
                                <TableRow>
                                    <TableCell colSpan={3} className="text-right font-medium text-muted-foreground">Total Available Stock</TableCell>
                                    <TableCell className="text-right font-bold text-lg text-foreground">{totals.availableMCs.toLocaleString()}</TableCell>
                                    <TableCell colSpan={2} />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
