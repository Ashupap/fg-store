'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <div className="bg-card border border-border rounded-xl p-8 max-w-md text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-foreground">Something went wrong</h2>
                <p className="mb-6 text-muted-foreground text-sm">
                    An unexpected error occurred. Please try refreshing or contact support.
                </p>
                <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        Reload Page
                    </Button>
                    <Button onClick={() => reset()}>
                        Try Again
                    </Button>
                </div>
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-6 text-left bg-muted rounded-lg p-4 text-xs font-mono text-destructive overflow-auto max-h-40 border border-border">
                        {error.message}
                    </div>
                )}
            </div>
        </div>
    );
}
