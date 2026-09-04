import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left" }>(
    ({ side = "right", className, children, ...props }, ref) => (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-black/65" />
            <DialogPrimitive.Content ref={ref} className={cn("fixed z-[120] flex flex-col gap-5 border-border-strong bg-mineral p-5 text-foreground shadow-[var(--de-shadow-md)] outline-none", side === "right" && "inset-y-0 right-0 w-[min(24rem,calc(100vw-1rem))] border-l", side === "left" && "inset-y-0 left-0 w-[min(24rem,calc(100vw-1rem))] border-r", side === "top" && "inset-x-0 top-0 border-b", side === "bottom" && "inset-x-0 bottom-0 border-t", className)} {...props}>
                <DialogPrimitive.Close aria-label="Close menu" className="absolute right-4 top-4 grid size-9 place-items-center rounded-control border border-border text-muted-foreground hover:border-signal hover:text-signal">{"\u00d7"}</DialogPrimitive.Close>
                {children}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    ),
);
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("grid gap-1.5", className)} {...props} />;
const SheetTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn("font-display text-xl font-bold", className)} {...props} />);
SheetTitle.displayName = DialogPrimitive.Title.displayName;
const SheetDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />);
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
