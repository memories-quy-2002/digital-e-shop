/* eslint-disable react/prop-types */
import * as React from "react";
import { createPortal } from "react-dom";
import { Button as ShadcnButton, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

type LegacyButtonProps = Omit<ButtonProps, "variant"> & { variant?: string };

const Button = React.forwardRef<HTMLButtonElement, LegacyButtonProps>(({ variant, ...props }, ref) => {
    const mappedVariant: ButtonProps["variant"] = variant === "secondary" ? "secondary" : variant === "danger" ? "destructive" : variant?.startsWith("outline") ? "outline" : variant === "link" ? "link" : "default";
    return <ShadcnButton ref={ref} variant={mappedVariant} {...props} />;
});
Button.displayName = "LegacyButton";

type ModalProps = {
    show?: boolean;
    onHide?: () => void;
    children?: React.ReactNode;
    dialogClassName?: string;
    contentClassName?: string;
    size?: "sm" | "lg" | "xl";
    centered?: boolean;
    animation?: boolean;
};

function Modal({ show = false, onHide, children, dialogClassName, contentClassName, size = "lg" }: ModalProps) {
    const dialogRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!show) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onHide?.();
        };
        document.addEventListener("keydown", handleKeyDown);
        const handleCloseEvent = () => onHide?.();
        dialogRef.current?.addEventListener("de-close", handleCloseEvent);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            dialogRef.current?.removeEventListener("de-close", handleCloseEvent);
        };
    }, [onHide, show]);

    if (!show) return null;
    const width = size === "sm" ? "max-w-md" : size === "xl" ? "max-w-6xl" : size === "lg" ? "max-w-4xl" : "max-w-2xl";
    return createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/65 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onHide?.()}>
            <div ref={dialogRef} role="dialog" aria-modal="true" className={cn("max-h-[min(90vh,900px)] w-full overflow-y-auto rounded-panel border border-border-strong bg-mineral shadow-[var(--de-shadow-md)]", width, dialogClassName, contentClassName)}>
                {children}
            </div>
        </div>,
        document.body,
    );
}

Modal.Header = function ModalHeader({ children, closeButton = false, className }: { children?: React.ReactNode; closeButton?: boolean; className?: string }) {
    return <div className={cn("flex items-center justify-between gap-4 border-b border-border px-5 py-4", className)}>{children}{closeButton ? <button type="button" className="grid size-9 place-items-center rounded-control text-muted-foreground hover:bg-surface-hover hover:text-foreground" aria-label="Close" onClick={(event) => { const dialog = event.currentTarget.closest('[role="dialog"]'); dialog?.dispatchEvent(new CustomEvent("de-close")); }}>×</button> : null}</div>;
};
Modal.Title = function ModalTitle({ children }: { children?: React.ReactNode }) { return <h2 className="font-display text-xl font-bold">{children}</h2>; };
Modal.Body = function ModalBody({ children, className }: { children?: React.ReactNode; className?: string }) { return <div className={cn("px-5 py-5", className)}>{children}</div>; };
Modal.Footer = function ModalFooter({ children, className }: { children?: React.ReactNode; className?: string }) { return <div className={cn("flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4", className)}>{children}</div>; };

type FormControlProps = React.InputHTMLAttributes<HTMLInputElement> & { as?: "textarea" | "select"; rows?: number; children?: React.ReactNode };
function FormControl({ as, className, children, ...props }: FormControlProps) {
    if (as === "textarea") {
        const textareaProps = props as React.TextareaHTMLAttributes<HTMLTextAreaElement>;
        return <textarea className={cn("min-h-28 w-full rounded-control border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric", className)} {...textareaProps}>{children}</textarea>;
    }
    if (as === "select") {
        const selectProps = props as React.SelectHTMLAttributes<HTMLSelectElement>;
        return <select className={cn("h-11 w-full rounded-control border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric", className)} {...selectProps}>{children}</select>;
    }
    return <input className={cn("h-11 w-full rounded-control border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric", className)} {...props} />;
}

function FormGroup({ children, className, controlId }: { children?: React.ReactNode; className?: string; controlId?: string }) { return <div className={cn("grid gap-2", className)} data-control-id={controlId}>{children}</div>; }
function FormLabel({ children, htmlFor, className }: { children?: React.ReactNode; htmlFor?: string; className?: string }) { return <label htmlFor={htmlFor} className={cn("text-sm font-semibold text-foreground", className)}>{children}</label>; }
function FormText({ children, className }: { children?: React.ReactNode; className?: string }) { return <div className={cn("text-xs text-muted-foreground", className)}>{children}</div>; }
function FormCheck({ type = "checkbox", label, className, inline: _inline, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; inline?: boolean }) { void _inline; return <label className={cn("inline-flex items-start gap-2 text-sm text-muted-foreground", className)}><input type={type} className="mt-1 accent-[var(--de-color-signal)]" {...props} />{label ? <span>{label}</span> : null}</label>; }

const FormBase = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(({ className, ...props }, ref) => <form ref={ref} className={cn("grid gap-4", className)} {...props} />);
FormBase.displayName = "LegacyForm";
const Form = Object.assign(FormBase, { Group: FormGroup, Label: FormLabel, Control: FormControl, Text: FormText, Check: FormCheck });

function Table({ children, className, responsive = false, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { responsive?: boolean; hover?: boolean; borderless?: boolean }) {
    const table = <table className={cn("w-full border-collapse text-left text-sm", className)} {...props}>{children}</table>;
    return responsive ? <div className="w-full overflow-x-auto">{table}</div> : table;
}

function Container({ children, className, fluid = false }: { children?: React.ReactNode; className?: string; fluid?: boolean }) { return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", fluid ? "max-w-none" : "max-w-[1240px]", className)}>{children}</div>; }

type ToastProps = { children?: React.ReactNode; onClose?: () => void; delay?: number; autohide?: boolean; animation?: boolean; className?: string };
function Toast({ children, onClose, delay = 3000, autohide = false, className }: ToastProps) {
    const toastRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!autohide) return;
        const timer = window.setTimeout(() => onClose?.(), delay);
        return () => window.clearTimeout(timer);
    }, [autohide, delay, onClose]);
    React.useEffect(() => {
        const handleCloseEvent = () => onClose?.();
        toastRef.current?.addEventListener("de-toast-close", handleCloseEvent);
        return () => toastRef.current?.removeEventListener("de-toast-close", handleCloseEvent);
    }, [onClose]);
    return <div ref={toastRef} data-toast="true" className={cn("w-[min(24rem,calc(100vw-2rem))] rounded-panel border border-border-strong bg-mineral p-4 shadow-[var(--de-shadow-md)]", className)}>{children}</div>;
}
Toast.Header = function ToastHeader({ children, closeButton = false, className }: { children?: React.ReactNode; closeButton?: boolean; className?: string }) { return <div className={cn("flex items-center gap-3", className)}>{children}{closeButton ? <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Close" onClick={(event) => { const toast = event.currentTarget.closest("[data-toast]"); toast?.dispatchEvent(new CustomEvent("de-toast-close")); }}>×</button> : null}</div>; };
Toast.Body = function ToastBody({ children, className }: { children?: React.ReactNode; className?: string }) { return <div className={cn("mt-2 text-sm text-muted-foreground", className)}>{children}</div>; };

function ToastContainer({ children, className }: { children?: React.ReactNode; className?: string; position?: string }) { return <div className={cn("pointer-events-none fixed z-[140] grid gap-3 [&>*]:pointer-events-auto", className)}>{children}</div>; }

export { Button, Modal, Form, Table, Container, Toast, ToastContainer };
