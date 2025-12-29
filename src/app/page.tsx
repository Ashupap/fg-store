import Link from 'next/link';
import { LayoutDashboard, Package, Snowflake, TrendingUp, Settings, ArrowRight, LogIn, LogOut, Ship, Truck, BookOpen } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BackgroundBeams } from "@/components/ui/aceternity/background-beams";
import { TypewriterEffect } from "@/components/ui/aceternity/typewriter-effect";
import { HoverBorderGradient } from "@/components/ui/aceternity/hover-border-gradient";

export const dynamic = 'force-dynamic';

async function getStats() {
  const db = getDb();
  try {
    const totalStock = db.prepare('SELECT COUNT(*) as count FROM fg_stock_master').get() as { count: number };
    const availableStock = db.prepare('SELECT COUNT(*) as count FROM fg_stock_master WHERE status = ?').get('Available') as { count: number };
    const varieties = db.prepare('SELECT COUNT(DISTINCT variety) as count FROM fg_stock_master').get() as { count: number };
    const todayActivity = db.prepare("SELECT COUNT(*) as count FROM stock_movement_log WHERE date(created_at) = date('now')").get() as { count: number };

    return {
      total: totalStock.count,
      available: availableStock.count,
      varieties: varieties.count,
      activity: todayActivity.count
    };
  } catch (e) {
    return { total: 0, available: 0, varieties: 0, activity: 0 };
  }
}

export default async function Home() {
  const user = await getCurrentUser();
  const stats = await getStats();

  // Fetch Settings
  const db = getDb();
  const settingsRes = db.prepare("SELECT value FROM settings WHERE key = 'enable_container_planning'").get() as { value: string } | undefined;
  const isShipmentsEnabled = settingsRes?.value === 'true';

  const titleWords = [
    { text: "Ocean", className: "text-slate-900" },
    { text: "Stock", className: "text-slate-900" },
    { text: "Manager", className: "text-[#2E8B57]" },
  ];

  return (
    <div className="min-h-screen w-full bg-white relative flex flex-col items-center justify-center antialiased overflow-hidden selection:bg-[#2E8B57]/20 selection:text-[#2E8B57]">
      {/* Background Beams */}
      <BackgroundBeams className="opacity-20" />

      {/* Content Container - z-10 to sit above beams */}
      <div className="relative z-10 w-full flex flex-col min-h-screen">

        {/* Header */}
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="container mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#2E8B57]/10 rounded-xl border border-[#2E8B57]/20 shadow-[0_0_15px_rgba(46,139,87,0.3)]">
                <Ship className="text-[#2E8B57] h-6 w-6" />
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900">Marine Flow</span>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-600 hidden sm:block">Welcome, {user.name}</span>
                  <form action={async () => {
                    'use server';
                    const cookieStore = await cookies();
                    cookieStore.delete('auth-token');
                    redirect('/');
                  }}>
                    <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer">
                      <LogOut size={16} className="mr-2" /> Logout
                    </Button>
                  </form>
                </div>
              ) : (
                <Link href="/login">
                  <Button className="rounded-full bg-[#2E8B57] text-white hover:bg-[#257045] flex items-center space-x-2 px-6 py-2 shadow-lg shadow-[#2E8B57]/20 transition-all hover:scale-105 cursor-pointer">
                    <LogIn size={16} />
                    <span>Login</span>
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-6 py-12 flex flex-col items-center">

          <div className="max-w-6xl mx-auto space-y-20 w-full">

            {/* Hero */}
            <div className="text-center space-y-8 pt-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#2E8B57]/30 bg-[#2E8B57]/5 text-[#2E8B57] text-sm font-medium mb-6 backdrop-blur-sm">
                <Snowflake size={14} className="animate-pulse" />
                <span>Next-Gen Seafood Logistics</span>
              </div>

              <TypewriterEffect words={titleWords} className="text-6xl md:text-8xl" cursorClassName="bg-[#2E8B57]" />

              <p className="text-lg md:text-2xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-light mt-6">
                Precision seafood inventory tracking powered by <span className="text-[#2E8B57] font-medium">advanced analytics</span>.
                Monitor stock levels, manage movements, and optimize logistics in real-time.
              </p>

              <div className="flex flex-col sm:flex-row justify-center gap-6 pt-10">
                <Link href="/dashboard">
                  <Button size="lg" className="rounded-full bg-[#2E8B57] text-white hover:bg-[#257045] px-8 py-6 text-lg shadow-xl shadow-[#2E8B57]/25 hover:scale-105 transition-all cursor-pointer">
                    Open Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>

                <Link href={user ? "/stock-movement" : "/login?redirect=/stock-movement"}>
                  <Button size="lg" variant="outline" className="h-[52px] rounded-full px-8 text-lg border-2 border-[#2E8B57] text-[#2E8B57] hover:bg-[#2E8B57]/5 hover:text-[#257045] backdrop-blur-md transition-all cursor-pointer">
                    Record Movement
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Grid - High Contrast */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: "Total Stock", value: stats.total.toLocaleString(), unit: "Master Cartons", icon: Package, color: "text-[#2E8B57]" },
                { label: "Ready to Ship", value: stats.available.toLocaleString(), unit: "Available Stock", icon: Ship, color: "text-emerald-600" },
                { label: "Active SKUs", value: stats.varieties.toLocaleString(), unit: "Product Varieties", icon: Snowflake, color: "text-amber-600" },
                { label: "Transactions", value: stats.activity.toLocaleString(), unit: "Today's Activity", icon: TrendingUp, color: "text-rose-600" },
              ].map((stat, i) => (
                <div key={i} className="group relative p-[1px] rounded-2xl bg-gradient-to-b from-slate-200 to-slate-100 hover:from-[#2E8B57]/50 hover:to-[#2E8B57]/20 transition-all duration-500 shadow-sm hover:shadow-lg">
                  <div className="bg-white h-full w-full rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <stat.icon className={`w-24 h-24 ${stat.color}`} />
                    </div>
                    <div className={`p-3 w-fit rounded-xl bg-[#2E8B57]/5 border border-[#2E8B57]/10 mb-4 ${stat.color}`}>
                      <stat.icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 relative z-10">
                      <div className="text-4xl font-bold text-slate-900 tracking-tight">{stat.value}</div>
                      <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                      <p className="text-slate-400 text-xs">{stat.unit}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation Deck */}
            <div className="grid md:grid-cols-2 gap-8 pb-20">
              {/* Dashboard Big Card */}
              <Link href="/dashboard" className="group relative col-span-1 md:col-span-2 lg:col-span-1 cursor-pointer">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#2E8B57] to-emerald-500 rounded-3xl opacity-0 group-hover:opacity-20 blur transition duration-500"></div>
                <div className="relative h-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl group-hover:shadow-2xl flex flex-col justify-between overflow-hidden transition-all">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#2E8B57]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-[#2E8B57]/10 flex items-center justify-center mb-6 border border-[#2E8B57]/20">
                      <LayoutDashboard className="text-[#2E8B57] w-8 h-8" />
                    </div>
                    <h3 className="text-3xl font-bold text-slate-900 mb-3">Main Dashboard</h3>
                    <p className="text-slate-500 text-lg leading-relaxed">
                      Comprehensive view of your frozen inventory. Analyze aging stock, track allocations, and monitor FCL capacities.
                    </p>
                  </div>
                  <div className="mt-8 flex items-center text-[#2E8B57] font-semibold group-hover:translate-x-2 transition-transform">
                    Explore Analytics <ArrowRight className="ml-2 w-5 h-5" />
                  </div>
                </div>
              </Link>

              {/* Right Side Grid */}
              <div className="grid gap-6">
                {[
                  { href: "/stock-movement", title: "Stock Movement", icon: Package, desc: "Inward, Outward & Returns", roles: ['admin', 'general_manager', 'manager', 'operator'] },
                  { href: "/po-allocation", title: "PO Allocation", icon: TrendingUp, desc: "Order Fulfillment & Tracking", roles: ['admin', 'general_manager', 'marketing_manager'] },
                  ...(isShipmentsEnabled ? [{ href: "/shipments", title: "Shipment Planning", icon: Truck, desc: "Container Loading & Manifests", roles: ['admin', 'general_manager'] }] : []),
                  { href: "/admin", title: "System Admin", icon: Settings, desc: "Master Data & Configuration", roles: ['admin', 'general_manager'] },
                  { href: "/guide", title: "User Guide", icon: BookOpen, desc: "System Documentation & Help", roles: ['all'] }
                ].filter(item => !user || item.roles.includes('all') || (user.role && item.roles.includes(user.role))).map((item, i) => (
                  <Link key={i} href={(user || item.roles.includes('all')) ? item.href : `/login?redirect=${item.href}`} className="group relative cursor-pointer">
                    <div className="h-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#2E8B57]/20 rounded-2xl p-6 transition-all duration-300 flex items-center gap-6 shadow-md hover:shadow-lg">
                      <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 group-hover:bg-[#2E8B57]/10 group-hover:scale-110 transition-all">
                        <item.icon className="text-slate-600 group-hover:text-[#2E8B57] w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-slate-900 group-hover:text-[#2E8B57] transition-colors">{item.title}</h4>
                        <p className="text-slate-500 text-sm">{item.desc}</p>
                      </div>
                      <ArrowRight className="ml-auto text-slate-400 group-hover:text-[#2E8B57] group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>


            {/* Footer */}
            <div className="text-center pb-8 relative z-10">
              <div className="inline-flex items-center gap-2 text-slate-500 bg-white/60 px-4 py-2 rounded-full border border-slate-200 backdrop-blur-md">
                <span>Built with</span>
                <span className="animate-heartbeat text-red-500 text-lg">❤️</span>
                <span>in India</span>
              </div>
            </div>

          </div>
        </main>
      </div >
    </div >
  );
}
