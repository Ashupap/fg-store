'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Snowflake, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (result.success) {
                // Use window.location.href to ensure a full refresh and robust navigation
                // This prevents issues where 'Enter' key might conflict with Router state
                if (result.user?.role === 'admin') {
                    window.location.href = '/admin';
                } else if (result.user?.role === 'marketing_manager') {
                    window.location.href = '/dashboard';
                } else {
                    window.location.href = '/stock-movement';
                }
                // router.refresh(); // Not needed with window.location.href
            } else {
                setError(result.error || 'Login failed');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: 'url(/grid.svg)', backgroundSize: '30px 30px' }} />

            {/* Ambient Background Effects */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2E8B57]/20 rounded-full blur-[100px] -z-10 animate-pulse-slow" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] -z-10 animate-pulse-slow delay-1000" />

            <div className="w-full max-w-md relative z-10 flex flex-col gap-6">
                {/* Logo Section */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2E8B57] to-indigo-600 shadow-xl shadow-[#2E8B57]/30 mb-4 ring-1 ring-white/20">
                        <Snowflake className="text-white h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome Back</h1>
                    <p className="text-muted-foreground">Sign in to your account to continue</p>
                </div>

                {/* Login Card */}
                <Card className="border-border/50 bg-card/60 backdrop-blur-xl shadow-2xl">
                    <CardHeader>
                        <CardTitle className="sr-only">Login</CardTitle>
                        <CardDescription className="text-center">
                            Enter your credentials below
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="username" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Username
                                </label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter username"
                                    required
                                    className="bg-background/50"
                                    autoComplete="username"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Password
                                </label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        required
                                        className="bg-background/50 pr-10"
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#2E8B57] hover:bg-[#257045] mt-2 shadow-lg shadow-[#2E8B57]/20 text-white"
                                size="lg"
                            >
                                {loading ? (
                                    'Signing in...'
                                ) : (
                                    <>
                                        Sign In
                                        <LogIn className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="justify-center border-t border-border/40 pt-4 pb-6 bg-muted/5">
                        <p className="text-sm text-muted-foreground">
                            Don't have an account? Contact your administrator.
                        </p>
                    </CardFooter>
                </Card>

                <div className="text-center text-sm">
                    <Link href="/dashboard" className="text-muted-foreground hover:text-[#2E8B57] transition-colors inline-flex items-center gap-1 group">
                        <span className="group-hover:underline">View Public Dashboard</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
