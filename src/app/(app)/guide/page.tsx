'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { BookOpen, Shield, Box, ShoppingCart, Truck, Settings } from 'lucide-react';

const GuideSection = ({ title, children, id }: { title: string, children: React.ReactNode, id: string }) => (
    <section id={id} className="mb-16 scroll-mt-24">
        <h2 className="text-3xl font-bold mb-6 text-neutral-800 dark:text-neutral-100 flex items-center gap-3">
            {title}
        </h2>
        <div className="space-y-6 text-neutral-600 dark:text-neutral-300">
            {children}
        </div>
    </section>
);

const GuideImage = ({ src, alt, caption }: { src: string, alt: string, caption?: string }) => (
    <div className="my-8 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-xl bg-neutral-50 dark:bg-neutral-900">
        <div className="relative aspect-video w-full">
            <Image
                src={src}
                alt={alt}
                fill
                className="object-contain p-4"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
            />
        </div>
        {caption && (
            <div className="bg-neutral-100 dark:bg-neutral-950 p-3 text-center text-sm text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-800">
                {caption}
            </div>
        )}
    </div>
);

export default function UserGuidePage() {
    return (
        <div className="bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 max-w-6xl mx-auto px-6 py-12 flex gap-12">
            {/* Table of Contents Sidebar */}
            <div className="hidden lg:block w-48 shrink-0 space-y-2 text-sm text-neutral-500 dark:text-neutral-400 sticky top-24 h-fit">
                <div className="font-semibold text-xs uppercase tracking-wider mb-3 text-neutral-400">On this page</div>
                <a href="#getting-started" className="block hover:text-[#2E8B57] transition-colors">Getting Started</a>
                <a href="#dashboard" className="block hover:text-[#2E8B57] transition-colors">Dashboard</a>
                <a href="#stock-movement" className="block hover:text-[#2E8B57] transition-colors">Stock Movement</a>
                <a href="#po" className="block hover:text-[#2E8B57] transition-colors">Purchase Orders</a>
                <a href="#admin" className="block hover:text-[#2E8B57] transition-colors">Admin</a>
            </div>

            <main className="flex-1 max-w-3xl min-w-0">

                {/* Header */}
                <div className="mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-6 h-6 text-[#2E8B57]" />
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">User Guide</span>
                    </div>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-800 to-neutral-500 dark:from-neutral-100 dark:to-neutral-500 mb-6"
                    >
                        FG Store Management System
                    </motion.h1>
                    <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
                        Comprehensive documentation for understanding and mastering the Cold Store inventory system.
                    </p>
                </div>

                <GuideSection id="getting-started" title="1. Getting Started">
                    <Shield className="w-8 h-8 text-[#2E8B57] mb-4" />
                    <p>
                        This User Guide is publicly accessible to help new users familiarize themselves with the system.
                        However, to access the <strong>Dashboard</strong> and perform operations, you must log in with your assigned credentials.
                    </p>
                    <p className="mt-4">The system supports strict Role-Based Access Control (RBAC) to ensure security.</p>

                    <GuideImage src="/guide/user_guide_login_1766834894528.png" alt="Login Page" caption="Secure Login Screen" />

                    <div className="grid md:grid-cols-2 gap-4 mt-6">
                        {[
                            { role: 'Admin', desc: 'Full access to all stores, settings, master data, and user management.' },
                            { role: 'General Manager', desc: 'Full visibility; Can manage Master Data and Stores. Cannot modify System Settings.' },
                            { role: 'Marketing Mgr', desc: 'Can access Dashboard and PO Allocation. No stock movement rights.' },
                            { role: 'Manager', desc: 'Can manage stock and approvals for their Assigned Stores only.' },
                            { role: 'Operator', desc: 'Restricted. Can only initiate movements for Assigned Stores.' }
                        ].map(r => (
                            <div key={r.role} className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                                <h4 className="font-bold text-[#2E8B57] mb-1">{r.role}</h4>
                                <p className="text-sm">{r.desc}</p>
                            </div>
                        ))}
                    </div>
                </GuideSection>

                <GuideSection id="dashboard" title="2. Dashboard Overview">
                    <Box className="w-8 h-8 text-[#2E8B57] mb-4" />
                    <p>Upon successfully logging in, you are greeted by the Dashboard. This protected section provides a real-time, consolidated snapshot of the inventory across all cold stores.</p>

                    <GuideImage src="/guide/user_guide_dashboard_1766836374877.png" alt="Dashboard" caption="Operational Dashboard" />

                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Stat Cards:</strong> Quick view of Total Stock, Pending Approvals, and Daily Activity.</li>
                        <li><strong>Capacity Utilization:</strong> Visual charts showing how full each cold store is, based on physical weight of the stock.</li>
                        <li><strong>Live Stock Position:</strong> A detailed, filterable table of current inventory, grouped by Store, Variety, and Packing. You can click column headers to sort.</li>
                    </ul>
                </GuideSection>

                <GuideSection id="stock-movement" title="3. Stock Management">
                    <Truck className="w-8 h-8 text-[#2E8B57] mb-4" />
                    <p>Navigate to the <strong>Stock Movement</strong> page to perform all inventory operations.</p>

                    <GuideImage src="/guide/user_guide_stock_list_1766836398351.png" alt="Stock List" caption="Stock Movement & History" />

                    <div className="mt-8 space-y-12">
                        <div>
                            <h3 className="text-xl font-bold mb-3">Inward Stock (Receipt)</h3>
                            <p>Use this to record new stock arriving from Production.</p>
                            <GuideImage src="/guide/user_guide_inward_modal_1766836416635.png" alt="Inward Modal" caption="Inward Stock Modal" />
                            <ol className="list-decimal pl-6 space-y-1">
                                <li>Click <strong>Inward Stock</strong>.</li>
                                <li>Select <strong>Store</strong>, <strong>Stock Details</strong> (Type, Variety, Packing, Grade), and <strong>Quantity</strong>.</li>
                                <li>Submit to add stock immediately.</li>
                            </ol>
                        </div>

                        <div>
                            <h3 className="text-xl font-bold mb-3">Transfer Stock (Internal)</h3>
                            <p>Move stock between Cold Stores (e.g., AME to BME).</p>
                            <GuideImage src="/guide/user_guide_transfer_modal_1766836453951.png" alt="Transfer Modal" caption="Transfer Stock Modal" />
                            <ol className="list-decimal pl-6 space-y-1">
                                <li>Click <strong>Transfer Stock</strong>.</li>
                                <li>Select <strong>From Store</strong> and <strong>To Store</strong>.</li>
                                <li>Select the specific stock items to move.</li>
                                <li>Submit to create a <em>Pending Approval</em> request. A Manager must approve it.</li>
                            </ol>
                        </div>
                    </div>
                </GuideSection>

                <GuideSection id="po" title="4. Purchase Orders">
                    <ShoppingCart className="w-8 h-8 text-[#2E8B57] mb-4" />
                    <p>Manage Customer Orders and automatically track allocations.</p>

                    <GuideImage src="/guide/user_guide_po_1766836514529.png" alt="Purchase Orders" caption="PO Management" />

                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>Create PO:</strong> Enter Client Name and ordered items.</li>
                        <li><strong>Real-time Allocation:</strong> The system automatically tracks "Allocated Qty" when you dispatch items against a PO.</li>
                        <li><strong>Status Tracking:</strong> POs remain "Active" until fully fulfilled.</li>
                    </ul>
                </GuideSection>

                <GuideSection id="admin" title="5. Administration">
                    <Settings className="w-8 h-8 text-[#2E8B57] mb-4" />
                    <p>Exclusive to Admins, this section allows full system control.</p>

                    <GuideImage src="/guide/user_guide_admin_1766836559859.png" alt="Admin Panel" caption="System Administration" />

                    <ul className="list-disc pl-6 space-y-2">
                        <li><strong>User Management:</strong> Create users and assign them to specific stores.</li>
                        <li><strong>Master Data:</strong> Configure the dropdown lists for Varieites, Grades, and Packings.</li>
                        <li><strong>Store Configuration:</strong> Add new cold stores or update capacities.</li>
                    </ul>
                </GuideSection>

            </main>
        </div>
    );
}
