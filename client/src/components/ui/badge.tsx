import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
    {
        variants: {
            variant: {
                default: "border-transparent bg-circuit/15 text-circuit",
                secondary: "border-border bg-mineral text-muted-foreground",
                outline: "border-border-strong bg-transparent text-foreground",
                signal: "border-signal/30 bg-signal/15 text-[#f58a68]",
                electric: "border-electric/30 bg-electric/15 text-[#8ab7ff]",
                danger: "border-destructive/30 bg-destructive/15 text-[#ff9a78]",
            },
        },
        defaultVariants: { variant: "default" },
    },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
