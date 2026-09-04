import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent px-4 py-2 font-semibold text-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
    {
        variants: {
            variant: {
                default: "bg-signal text-primary-foreground hover:bg-[#f07a55] shadow-[0_8px_18px_rgba(228,102,61,0.22)]",
                secondary: "bg-mineral text-foreground border-border hover:bg-[var(--de-color-surface-hover)]",
                outline: "border-border-strong bg-transparent text-foreground hover:border-electric hover:text-electric",
                ghost: "bg-transparent text-muted-foreground hover:bg-mineral hover:text-foreground",
                destructive: "bg-destructive text-destructive-foreground hover:bg-[var(--de-color-danger-strong)]",
                link: "h-auto min-h-0 rounded-none p-0 text-electric underline-offset-4 hover:underline",
            },
            size: {
                default: "min-h-11",
                sm: "min-h-9 px-3 text-xs",
                lg: "min-h-12 px-5 text-base",
                icon: "size-11 min-h-0 px-0",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, type = "button", ...props }, ref) => (
        <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
