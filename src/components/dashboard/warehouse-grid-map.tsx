'use client';
import { Snowflake, X, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface StockLocateRow {
  mc_number: string;
  short_code?: string;
  variety: string;
  grade: string;
  packing_code: string;
  type: string;
  cold_store: string;
  section_name: string;
  status: string;
}

interface Section {
  id: string;
  name: string;
  storeName: string;
  storeType: string;
  capacityMcs: number;
}

interface WarehouseGridMapProps {
  sections: Section[];
  activeStock: StockLocateRow[];
  selectedStore: string;
  setSelectedStore: (s: string) => void;
  selectedSection: (Section & { cartons: StockLocateRow[] }) | null;
  setSelectedSection: (sec: (Section & { cartons: StockLocateRow[] }) | null) => void;
  drawerSearch: string;
  setDrawerSearch: (s: string) => void;
  drawerTab: 'sku' | 'checklist';
  setDrawerTab: (tab: 'sku' | 'checklist') => void;
}

function SKUSummaryView({ cartons }: { cartons: StockLocateRow[] }) {
  const groups: { [key: string]: { type: string; variety: string; grade: string; count: number } } = {};
  cartons.forEach(c => {
    const key = `${c.type}-${c.variety}-${c.grade}`;
    if (!groups[key]) groups[key] = { type: c.type, variety: c.variety, grade: c.grade, count: 0 };
    groups[key].count++;
  });
  const list = Object.values(groups).sort((a, b) => b.count - a.count);

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card/20">
      <Table>
        <TableHeader>
          <TableRow className="border-border/30 hover:bg-transparent bg-muted/30">
            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Stock Type</th>
            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Variety</th>
            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Grade</th>
            <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Cartons</th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((item, idx) => (
            <TableRow key={idx} className="border-border/20 hover:bg-muted/10">
              <TableCell className="py-3 px-4 text-xs text-foreground font-semibold">{item.type}</TableCell>
              <TableCell className="py-3 px-4 text-xs text-foreground font-semibold">{item.variety}</TableCell>
              <TableCell className="py-3 px-4 text-xs text-foreground">{item.grade}</TableCell>
              <TableCell className="py-3 px-4 text-xs text-right font-bold text-primary font-mono">{item.count} MCs</TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground italic">No cartons stored in this section.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CartonChecklistView({ cartons, search, setSearch }: { cartons: StockLocateRow[]; search: string; setSearch: (s: string) => void }) {
  const filtered = cartons.filter(c => {
    const q = search.toLowerCase();
    return c.mc_number.toLowerCase().includes(q) || (c.short_code && c.short_code.toLowerCase().includes(q)) || c.variety.toLowerCase().includes(q) || c.grade.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by MC, Short Code, Variety, Grade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background/50 border-border/60 text-xs h-9" />
      </div>
      <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card/20 max-h-[350px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent bg-muted/30">
              <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left w-12">Select</th>
              <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">MC Number</th>
              <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Short Code</th>
              <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">SKU Specs</th>
              <th className="py-2.5 px-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-left">Status</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.mc_number} className="border-border/20 hover:bg-muted/10">
                <TableCell className="py-2.5 px-4 text-center">
                  <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                </TableCell>
                <TableCell className="py-2.5 px-4 font-mono font-semibold text-xs text-foreground">{c.mc_number}</TableCell>
                <TableCell className="py-2.5 px-4 font-mono font-bold text-xs text-primary">{c.short_code || '---'}</TableCell>
                <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.variety}</span> | {c.grade} | {c.packing_code}
                </TableCell>
                <TableCell className="py-2.5 px-4 text-xs">
                  <Badge variant={c.status === 'Available' ? 'outline' : 'secondary'} className={c.status === 'Available' ? 'border-emerald-300 text-emerald-700 bg-emerald-500/5 font-semibold text-[9px] px-1 py-0.5' : 'font-semibold text-[9px] px-1 py-0.5'}>
                    {c.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground italic">No cartons found matching the search.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function WarehouseGridMap({ sections, activeStock, selectedStore, setSelectedStore, selectedSection, setSelectedSection, drawerSearch, setDrawerSearch, drawerTab, setDrawerTab }: WarehouseGridMapProps) {
  const storeRecord: Record<string, string> = {};
  sections.forEach(s => { if (s.storeName) storeRecord[s.storeName] = s.storeType || 'Cold Store'; });
  const uniqueStores = Object.entries(storeRecord).map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
  const storeSections = sections.filter(s => s.storeName === selectedStore);
  const storeStock = activeStock.filter(c => c.cold_store === selectedStore);

  const sectionCartonsMap: { [key: string]: StockLocateRow[] } = {};
  storeSections.forEach(sec => { sectionCartonsMap[sec.name] = storeStock.filter(c => c.section_name === sec.name); });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap gap-2 border-b border-border/20 pb-4">
        {uniqueStores.map(store => (
          <Button key={store.name} variant={selectedStore === store.name ? 'default' : 'outline'} onClick={() => setSelectedStore(store.name)} className="h-9 px-4 text-xs font-semibold gap-1.5">
            <Snowflake size={14} className="mr-0.5" />
            {store.name}
            {store.type === 'Rented' && (
              <span className="text-[8px] bg-violet-600 text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">Rented</span>
            )}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {storeSections.map(section => {
          const cartons = sectionCartonsMap[section.name] || [];
          const occupied = cartons.length;
          const capacity = section.capacityMcs;
          const pct = Math.min(100, capacity > 0 ? (occupied / capacity) * 100 : 0);
          let colorClass = 'bg-emerald-500 text-emerald-500';
          let bgLightClass = 'bg-emerald-500/10 border-emerald-500/20';
          if (pct >= 90) { colorClass = 'bg-rose-500 text-rose-500'; bgLightClass = 'bg-rose-500/10 border-rose-500/20'; }
          else if (pct >= 70) { colorClass = 'bg-amber-500 text-amber-500'; bgLightClass = 'bg-amber-500/10 border-amber-500/20'; }

          const varCounts: Record<string, number> = {};
          cartons.forEach(c => { varCounts[c.variety] = (varCounts[c.variety] || 0) + 1; });
          const topVars = Object.entries(varCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);

          return (
            <Card key={section.id} className="group border border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all duration-300 cursor-pointer shadow-sm relative overflow-hidden active:scale-[0.98]"
              onClick={() => { setSelectedSection({ ...section, cartons }); setDrawerTab('sku'); setDrawerSearch(''); }}>
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${colorClass.split(' ')[0]}`} />
              <CardContent className="p-5 pt-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-foreground text-sm tracking-tight group-hover:text-primary transition-colors">{section.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Warehouse Section</p>
                  </div>
                  <Badge className={`${bgLightClass} font-bold text-[10px] shadow-none border`}>{pct.toFixed(0)}% Full</Badge>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-muted-foreground">Occupancy:</span>
                    <span className="text-foreground">{occupied} / {capacity} MCs</span>
                  </div>
                  <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden border border-border/10">
                    <div className={`h-full rounded-full transition-all duration-500 ${colorClass.split(' ')[0]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="pt-2 border-t border-border/10 space-y-1">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Variety Summary</span>
                  {topVars.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {topVars.map(v => <Badge key={v} variant="secondary" className="text-[8px] px-1.5 py-0 font-medium">{v}</Badge>)}
                    </div>
                  ) : (
                    <span className="text-[9px] text-muted-foreground italic block">No active cartons stored</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {storeSections.length === 0 && (
          <div className="col-span-full p-8 text-center text-muted-foreground italic">No storage sections configured for this store.</div>
        )}
      </div>

      {selectedSection && (
        <div className="fixed inset-0 z-[150] overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in" onClick={() => setSelectedSection(null)} />
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
              <div className="pointer-events-auto w-screen max-w-2xl transform transition-transform duration-300 slide-in-from-right bg-background border-l border-border shadow-2xl flex flex-col h-full">
                <div className="px-6 py-5 bg-muted/20 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold text-foreground" id="slide-over-title">{selectedSection.name} Details</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Store: <span className="font-semibold">{selectedSection.storeName}</span></p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedSection(null)} className="rounded-full"><X size={20} /></Button>
                </div>
                <div className="p-6 border-b border-border bg-muted/10 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Occupied space</span>
                    <div className="text-xl font-black text-foreground mt-1 font-mono">{selectedSection.cartons.length} MCs</div>
                    <span className="text-[11px] text-muted-foreground">Total Capacity: {selectedSection.capacityMcs} MCs</span>
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="flex justify-between text-xs text-muted-foreground font-semibold mb-1">
                      <span>Occupancy Rate</span>
                      <span>{((selectedSection.cartons.length / selectedSection.capacityMcs) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden border border-border/10">
                      <div className={`h-full rounded-full transition-all duration-300 ${(selectedSection.cartons.length / selectedSection.capacityMcs) * 100 >= 90 ? 'bg-rose-500' : (selectedSection.cartons.length / selectedSection.capacityMcs) * 100 >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (selectedSection.cartons.length / selectedSection.capacityMcs) * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="border-b border-border flex px-6">
                  <button onClick={() => setDrawerTab('sku')} className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all relative ${drawerTab === 'sku' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>SKU Summary Table</button>
                  <button onClick={() => setDrawerTab('checklist')} className={`py-3 px-4 font-semibold text-xs border-b-2 transition-all relative ${drawerTab === 'checklist' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Carton Checklist ({selectedSection.cartons.length})</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {drawerTab === 'sku' ? <SKUSummaryView cartons={selectedSection.cartons} /> : <CartonChecklistView cartons={selectedSection.cartons} search={drawerSearch} setSearch={setDrawerSearch} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
