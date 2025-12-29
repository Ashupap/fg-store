'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 max-w-md text-center shadow-2xl">
                <h2 className="text-2xl font-bold mb-4 text-red-500">System Error</h2>
                <p className="mb-6 text-neutral-400">
                    An unexpected error occurred within the application.
                    Please try refreshing or contacting support.
                </p>
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={() => window.location.reload()} // Hard Reset first
                        className="px-6 py-2 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors"
                    >
                        Reload Page
                    </button>
                    <button
                        onClick={() => reset()}
                        className="px-6 py-2 bg-[#2E8B57] rounded hover:bg-[#3CB371] transition-colors font-medium shadow-[0_0_15px_rgba(46,139,87,0.3)]"
                    >
                        Try Again
                    </button>
                </div>
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-8 text-left bg-black p-4 rounded text-xs font-mono text-red-400 overflow-auto max-h-40">
                        {error.message}
                    </div>
                )}
            </div>
        </div>
    );
}
