'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Check,
    X,
    AlertTriangle,
    ArrowLeft,
    Truck,
    Box,
    History,
    Zap,
    Container
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

type Feedback = {
    type: 'success' | 'warning' | 'error' | 'idle';
    message: string;
    detail?: string;
    timestamp?: Date;
    mc?: string;
};

export default function LoadingPage() {
    const params = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [shipment, setShipment] = useState<any>(null);
    const [stats, setStats] = useState({ loaded: 0, total: 0 });
    const [input, setInput] = useState('');
    const [feedback, setFeedback] = useState<Feedback>({ type: 'idle', message: 'Ready to Scan' });
    const [recentScans, setRecentScans] = useState<Feedback[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial Fetch
    useEffect(() => {
        fetchShipmentDetails();
    }, []);

    // Keep focus on input
    useEffect(() => {
        const interval = setInterval(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const fetchShipmentDetails = async () => {
        try {
            const [res, settingsRes] = await Promise.all([
                fetch(`/api/shipment/${params.id}`),
                fetch('/api/admin/settings')
            ]);

            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.data['enable_container_planning'] !== 'true') {
                router.replace('/dashboard');
                return;
            }

            const data = await res.json();
            if (data.success) {
                setShipment(data.data.shipment);
                const loaded = data.data.items.filter((i: any) => i.is_loaded).length;
                setStats({ loaded, total: data.data.items.length });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        const mcNumber = input.trim();
        if (!mcNumber) return;

        setInput('');

        try {
            const res = await fetch(`/api/shipment/${params.id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mcNumber })
            });
            const result = await res.json();

            const newFeedback: Feedback = {
                type: result.success ? (result.status === 'SUCCESS' ? 'success' : 'warning') : 'error',
                message: result.success ? (result.status === 'SUCCESS' ? 'Verified' : 'Duplicate') : 'Invalid',
                detail: result.message || mcNumber,
                timestamp: new Date(),
                mc: mcNumber
            };

            setFeedback(newFeedback);
            setRecentScans(prev => [newFeedback, ...prev].slice(0, 10));

            // Reset feedback to idle after 3 seconds
            setTimeout(() => setFeedback(prev => prev.mc === mcNumber ? { ...prev, type: 'idle', message: 'Ready to Scan' } : prev), 3000);

            if (result.success && result.status === 'SUCCESS' && result.data) {
                setStats({ loaded: result.data.loadedCount, total: result.data.totalCount });
            }
        } catch (error) {
            setFeedback({ type: 'error', message: 'Error', detail: 'Network failed' });
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin h-8 w-8 border-4 border-emerald-500 rounded-full border-t-transparent"></div>
                <p className="text-emerald-500/80 font-mono text-sm tracking-widest">INITIALIZING...</p>
            </div>
        </div>
    );

    if (!shipment) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
            <div className="text-center space-y-4 max-w-sm w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
                    <X size={32} />
                </div>
                <h2 className="text-xl font-bold">Shipment Not Found</h2>
                <Button onClick={() => router.back()} variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-white">Go Back</Button>
            </div>
        </div>
    );

    const progress = (stats.loaded / stats.total) * 100;
    const circumference = 2 * Math.PI * 120; // 120 is radius
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* Header */}
            <header className="px-6 py-4 flex justify-between items-center z-10 sticky top-0 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
                <Button onClick={() => router.back()} variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-white/10 rounded-full">
                    <ArrowLeft size={20} />
                </Button>
                <div className="text-right">
                    <div className="flex items-center justify-end gap-2 text-emerald-400 font-bold tracking-tight">
                        <Truck size={16} />
                        <span>{shipment.shipment_no}</span>
                    </div>
                    <p className="text-[10px] uppercase font-mono text-slate-500 tracking-wider mt-0.5">{shipment.container_no}</p>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-start py-8 px-6 gap-8 relative z-10 max-w-lg mx-auto w-full">

                {/* Circular Progress & Scanner Status */}
                <div className="relative w-72 h-72 flex items-center justify-center">
                    {/* SVG Ring */}
                    <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 260 260">
                        {/* Track */}
                        <circle cx="130" cy="130" r="120" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                        {/* Progress */}
                        <motion.circle
                            initial={{ strokeDashoffset: circumference }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            cx="130" cy="130" r="120"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeLinecap="round"
                            className="text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        />
                    </svg>

                    {/* Center Content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            key={stats.loaded}
                            className="text-center"
                        >
                            <span className="text-7xl font-black tracking-tighter text-white drop-shadow-2xl">
                                {stats.loaded}
                            </span>
                            <div className="h-px w-12 bg-white/20 mx-auto my-2" />
                            <span className="text-2xl text-slate-500 font-light">
                                {stats.total}
                            </span>
                        </motion.div>
                    </div>

                    {/* Status Glow Ring */}
                    <motion.div
                        animate={{
                            boxShadow: feedback.type === 'success' ? "0 0 60px -10px rgba(16,185,129,0.4)" :
                                feedback.type === 'error' ? "0 0 60px -10px rgba(239,68,68,0.4)" :
                                    feedback.type === 'warning' ? "0 0 60px -10px rgba(245,158,11,0.4)" :
                                        "0 0 0px 0px rgba(0,0,0,0)"
                        }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-4 rounded-full border border-white/5 bg-slate-900/50 backdrop-blur-sm -z-10"
                    />
                </div>

                {/* Feedback Card */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={feedback.timestamp?.toISOString() || 'idle'}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full"
                    >
                        <Card className={`border-0 bg-slate-900/80 backdrop-blur-xl shadow-2xl overflow-hidden relative ${feedback.type === 'success' ? 'ring-2 ring-emerald-500/20' :
                            feedback.type === 'error' ? 'ring-2 ring-red-500/20' :
                                feedback.type === 'warning' ? 'ring-2 ring-amber-500/20' :
                                    'ring-1 ring-white/10'
                            }`}>
                            {/* Animated Background Line */}
                            {feedback.type === 'idle' && (
                                <motion.div
                                    animate={{ x: ['-100%', '100%'] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                    className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"
                                />
                            )}

                            <CardContent className="p-6 flex items-center gap-5">
                                <div className={`p-4 rounded-2xl shrink-0 ${feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                                    feedback.type === 'error' ? 'bg-red-500/10 text-red-500' :
                                        feedback.type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                                            'bg-slate-800 text-slate-500'
                                    }`}>
                                    {feedback.type === 'success' && <Check size={28} strokeWidth={3} />}
                                    {feedback.type === 'error' && <X size={28} strokeWidth={3} />}
                                    {feedback.type === 'warning' && <AlertTriangle size={28} strokeWidth={3} />}
                                    {feedback.type === 'idle' && <Zap size={28} strokeWidth={3} className="animate-pulse" />}
                                </div>
                                <div className="space-y-1">
                                    <h3 className={`text-xl font-bold leading-none ${feedback.type === 'success' ? 'text-emerald-400' :
                                        feedback.type === 'error' ? 'text-red-400' :
                                            feedback.type === 'warning' ? 'text-amber-400' :
                                                'text-white'
                                        }`}>{feedback.message}</h3>
                                    <p className="text-sm font-mono text-slate-400">{feedback.detail || 'Waiting for scanner input...'}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </AnimatePresence>

                {/* Input (Hidden but Functional) */}
                <form onSubmit={handleScan} className="w-full">
                    <div className="relative group">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            className="w-full bg-slate-900/50 border border-white/10 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-center text-emerald-400 font-mono text-sm uppercase tracking-widest outline-none transition-all placeholder:text-slate-700"
                            placeholder="Manual Entry"
                            autoFocus
                        />
                    </div>
                </form>

                {/* Recent Scans Drawer */}
                <div className="w-full space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <History size={12} /> Recent Scans
                        </span>
                        <Badge variant="outline" className="text-[10px] border-slate-800 bg-slate-900 text-slate-400">
                            LAST 10
                        </Badge>
                    </div>
                    <div className="space-y-2">
                        <AnimatePresence>
                            {recentScans.map((scan, i) => (
                                <motion.div
                                    key={scan.timestamp?.getTime() || i}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-white/5 hover:bg-slate-900/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-1.5 h-1.5 rounded-full ${scan.type === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' :
                                            scan.type === 'warning' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' :
                                                'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                                            }`} />
                                        <span className="font-mono text-sm text-slate-300">{scan.mc}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-600 font-mono">
                                        {scan.timestamp?.toLocaleTimeString([], { hour12: false })}
                                    </span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {recentScans.length === 0 && (
                            <div className="text-center py-6 text-slate-700 text-sm font-light italic">
                                No items scanned yet
                            </div>
                        )}
                    </div>
                </div>

            </main>
        </div>
    );
}
