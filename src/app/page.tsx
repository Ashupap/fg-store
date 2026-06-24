import Link from 'next/link';
import { 
    Ship, Package, TrendingUp, Truck, Settings, BookOpen, 
    ArrowRight, LogIn, LogOut, BarChart3, Shield, Zap,
    CheckCircle, Layers, Snowflake
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { BackgroundBeams } from "@/components/ui/aceternity/background-beams";
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const FEATURES = [
    {
        icon: Package,
        title: 'Stock Movement',
        description: 'Record inward receipts, inter-store transfers, and dispatches with full FIFO traceability and MC-level tracking.',
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
    },
    {
        icon: BarChart3,
        title: 'Live Dashboard',
        description: 'Real-time inventory position across all cold stores. Aging alerts, FCL capacity indicators, and exportable reports.',
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
    },
    {
        icon: TrendingUp,
        title: 'PO Allocation',
        description: 'Auto-allocate stock to purchase orders using FIFO. Track fulfillment status and release allocations with one click.',
        color: 'text-indigo-500',
        bg: 'bg-indigo-500/10',
    },
    {
        icon: Truck,
        title: 'Shipment Planning',
        description: 'Plan container loading for FCL shipments. Generate manifests and track container utilization in real time.',
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
    },
    {
        icon: Layers,
        title: 'Repacking Workflow',
        description: 'Manage dummy-to-branded carton repacking with customer barcode integration and sequential MC code tracking.',
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
    },
    {
        icon: Shield,
        title: 'Role-Based Access',
        description: 'Granular permissions for admin, GM, managers, operators and marketing. Custom roles with fine-grained controls.',
        color: 'text-rose-500',
        bg: 'bg-rose-500/10',
    },
    {
        icon: Zap,
        title: 'Sequential MC Codes',
        description: 'Auto-generate 3-4 character sequential codes for each master carton. Print label sheets for operators in one click.',
        color: 'text-yellow-500',
        bg: 'bg-yellow-500/10',
    },
    {
        icon: Settings,
        title: 'System Administration',
        description: 'Manage master data (varieties, grades, packings), stores, users, and feature toggles from a single admin panel.',
        color: 'text-slate-500',
        bg: 'bg-slate-500/10',
    },
];

const WORKFLOW_STEPS = [
    { step: '01', title: 'Receive Stock', desc: 'Production sends MCs to store. Operator records inward via Stock Movement. System generates sequential MC codes.' },
    { step: '02', title: 'Allocate to Orders', desc: 'Marketing creates POs. System auto-allocates available stock using FIFO logic, ensuring oldest stock ships first.' },
    { step: '03', title: 'Transfer or Repack', desc: 'Move stock between cold stores or initiate repacking. System tracks each MC through every stage.' },
    { step: '04', title: 'Dispatch & Ship', desc: 'Dispatch against PO. Plan containers, generate manifests, and complete customer dispatch with full audit trail.' },
];

export default async function LandingPage() {
    const user = await getCurrentUser();

    return (
        <div className="min-h-screen w-full bg-background relative flex flex-col antialiased overflow-hidden selection:bg-primary/20 selection:text-primary">
            <BackgroundBeams className="opacity-15" />

            <div className="relative z-10 w-full flex flex-col min-h-screen">
                {/* Header */}
                <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(46,139,87,0.2)]">
                                <Ship className="text-primary h-5 w-5" />
                            </div>
                            <div>
                                <span className="font-bold text-lg tracking-tight text-foreground">Marine Flow</span>
                                <span className="hidden sm:inline text-xs text-muted-foreground ml-2">FG Store ERP</span>
                            </div>
                        </div>

                        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
                            <a href="#workflow" className="hover:text-foreground transition-colors">How it Works</a>
                            <Link href="/guide" className="hover:text-foreground transition-colors">Guide</Link>
                        </nav>

                        <div className="flex items-center gap-3">
                            {user ? (
                                <div className="flex items-center gap-3">
                                    <span className="hidden sm:block text-sm text-muted-foreground">
                                        Welcome, <span className="font-medium text-foreground">{user.name}</span>
                                    </span>
                                    <Link href="/dashboard">
                                        <Button size="sm" className="gap-2 rounded-full">
                                            Open Dashboard <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                    <Link href="/api/auth/logout" prefetch={false}>
                                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                                            <LogOut size={16} /> Logout
                                        </Button>
                                    </Link>
                                </div>
                            ) : (
                                <Link href="/login">
                                    <Button size="sm" className="gap-2 rounded-full">
                                        <LogIn size={16} /> Login
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </header>

                {/* Hero */}
                <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 max-w-4xl mx-auto w-full">
                    <div className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full bg-primary/10 text-primary border border-primary/30 mb-6">
                        <Snowflake size={13} className="animate-pulse" />
                        Seafood Processing ERP
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-foreground tracking-tight leading-[1.1] mb-6">
                        Finished Goods
                        <span className="text-primary block">Store Management</span>
                    </h1>

                    <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed mb-10 font-light">
                        End-to-end traceability for your cold store operations. From production inward to customer dispatch — every master carton tracked, every movement logged.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        {user ? (
                            <Link href="/dashboard">
                                <Button size="lg" className="gap-2 rounded-full text-lg px-10">
                                    Open Dashboard <ArrowRight className="h-5 w-5" />
                                </Button>
                            </Link>
                        ) : (
                            <>
                                <Link href="/login">
                                    <Button size="lg" className="gap-2 rounded-full text-lg px-10">
                                        Get Started <ArrowRight className="h-5 w-5" />
                                    </Button>
                                </Link>
                                <a href="#features">
                                    <Button variant="outline" size="lg" className="rounded-full text-lg px-8 border-primary/40 text-primary hover:bg-primary/5">
                                        See Features
                                    </Button>
                                </a>
                            </>
                        )}
                    </div>

                    {/* Trust badges */}
                    <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                        {['FIFO Inventory Control', 'Role-Based Access', 'Audit Trail', 'Excel Export'].map(item => (
                            <div key={item} className="flex items-center gap-1.5">
                                <CheckCircle size={14} className="text-primary" />
                                {item}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Features Grid */}
                <section id="features" className="py-20 px-6 bg-muted/30 border-t border-border">
                    <div className="max-w-7xl mx-auto">
                        <div className="text-center mb-14">
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Everything you need</h2>
                            <p className="text-muted-foreground max-w-xl mx-auto text-lg">Purpose-built for seafood processing operations. Every feature designed around your real workflow.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            {FEATURES.map((feature, i) => (
                                <div key={i} className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300 group">
                                    <div className={`w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                        <feature.icon className={`w-5 h-5 ${feature.color}`} />
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Workflow */}
                <section id="workflow" className="py-20 px-6 bg-background border-t border-border">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-14">
                            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">How it Works</h2>
                            <p className="text-muted-foreground max-w-xl mx-auto text-lg">Four simple stages — from production floor to customer delivery.</p>
                        </div>

                        <div className="grid md:grid-cols-4 gap-6 relative">
                            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30" />

                            {WORKFLOW_STEPS.map((step, i) => (
                                <div key={i} className="relative flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-4 relative z-10">
                                        <span className="text-primary font-bold text-sm">{step.step}</span>
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="py-16 px-6 bg-gradient-to-br from-primary to-emerald-600">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl font-bold text-white mb-4">Ready to streamline your operations?</h2>
                        <p className="text-emerald-100 text-lg mb-8">Login and start managing your cold store inventory with precision.</p>
                        <Link href={user ? '/dashboard' : '/login'}>
                            <Button size="lg" className="gap-2 rounded-full bg-white text-primary hover:bg-emerald-50 text-lg px-10 shadow-xl">
                                {user ? 'Open Dashboard' : 'Login to Get Started'} <ArrowRight className="h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </section>

                {/* Footer */}
                <footer className="border-t border-border bg-background py-6 px-6">
                    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Ship className="text-primary h-4 w-4" />
                            <span className="font-medium text-foreground">Marine Flow</span>
                            <span>· FG Store Management System</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Built with heart in India</span>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
