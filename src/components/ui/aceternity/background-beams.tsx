"use strict";
import { cn } from "@/lib/utils";
import React from "react";

export const BackgroundBeams = ({ className }: { className?: string }) => {
    return (
        <div
            className={cn(
                "absolute h-full w-full inset-0 bg-background overflow-hidden",
                className
            )}
        >
            <div className="absolute h-full w-full pointer-events-none opacity-40">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="100%"
                    height="100%"
                    viewBox="0 0 1600 800"
                    className="w-full h-full opacity-30"
                    fill="none"
                >
                    <path
                        d="M-500 0 L800 1000 L2100 0 Z"
                        fill="url(#gradient-1)"
                        className="animate-beam-1"
                    />
                    <path
                        d="M-300 800 L800 0 L1900 800 Z"
                        fill="url(#gradient-2)"
                        className="animate-beam-2"
                    />
                    <path
                        d="M0 400 L1600 400 L800 1200 Z"
                        fill="url(#gradient-3)"
                        className="animate-beam-3"
                    />
                    <defs>
                        <linearGradient id="gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#0D9488" stopOpacity="0" />
                            <stop offset="50%" stopColor="#0D9488" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="gradient-2" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0" />
                            <stop offset="50%" stopColor="#14B8A6" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="gradient-3" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stopColor="#0F766E" stopOpacity="0" />
                            <stop offset="50%" stopColor="#0F766E" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#0F766E" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <div className="absolute inset-0 bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
        </div>
    );
};
