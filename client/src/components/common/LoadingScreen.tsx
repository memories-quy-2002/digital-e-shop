import React from "react";
import { Skeleton } from "../ui/skeleton";

type LoadingScreenProps = {
    variant?: "inline" | "page";
};

const LoadingScreen = ({ variant = "inline" }: LoadingScreenProps) => {
    if (variant === "page") {
        return (
            <div
                className="min-h-screen bg-background px-4 pb-8 pt-24 sm:px-6 lg:px-8"
                role="status"
                aria-label="Loading page"
                aria-busy="true"
            >
                <div className="mx-auto grid w-full max-w-[1240px] gap-5">
                    <div className="grid gap-5 rounded-panel border border-border bg-card p-6 shadow-sm">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-10 w-full max-w-xl" />
                        <Skeleton className="h-4 w-full max-w-2xl" />
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Skeleton key={index} className="min-h-56 rounded-panel" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full px-4" role="status" aria-label="Loading" aria-busy="true">
            <Skeleton className="h-1.5 w-full rounded-full">
                <span className="sr-only">Loading</span>
            </Skeleton>
        </div>
    );
};

export default LoadingScreen;
