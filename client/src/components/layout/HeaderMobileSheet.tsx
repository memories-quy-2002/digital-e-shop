import type { ReactNode } from "react";
import { Sheet, SheetContent } from "../ui/sheet";

type HeaderMobileSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    id: string;
    closeLabel: string;
    children: ReactNode;
};

/** The mobile dialog is only downloaded after the user requests navigation. */
export default function HeaderMobileSheet({
    open, onOpenChange, id, closeLabel, children,
}: HeaderMobileSheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" motion className="header__mobile is-open" id={id} closeLabel={closeLabel}>
                {children}
            </SheetContent>
        </Sheet>
    );
}
