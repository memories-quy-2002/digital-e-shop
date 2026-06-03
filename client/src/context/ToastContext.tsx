import React, { createContext, useCallback, useContext, useMemo, useReducer, ReactNode } from "react";
import { Toast, ToastContainer } from "react-bootstrap";
import "../styles/components/_toast.scss";

interface ToastMessage {
    id: number;
    title: string;
    body: string;
    tone: "success" | "error" | "info";
}

type Action =
    | { type: "ADD_TOAST"; toast: ToastMessage }
    | { type: "REMOVE_TOAST"; id: number };

interface ToastContextProps {
    toasts: ToastMessage[];
    addToast: (title: string, body: string) => void;
    removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

const toastReducer = (
    state: ToastMessage[],
    action: Action
): ToastMessage[] => {
    switch (action.type) {
        case "ADD_TOAST":
            return [...state, action.toast];
        case "REMOVE_TOAST":
            return state.filter((toast) => toast.id !== action.id);
        default:
            return state;
    }
};

let toastId = 1;

const inferToastTone = (title: string, body: string): ToastMessage["tone"] => {
    const content = `${title} ${body}`.toLowerCase();

    if (
        content.includes("failed") ||
        content.includes("error") ||
        content.includes("invalid") ||
        content.includes("unable") ||
        content.includes("expired") ||
        content.includes("not found")
    ) {
        return "error";
    }

    if (
        content.includes("success") ||
        content.includes("successfully") ||
        content.includes("added") ||
        content.includes("created") ||
        content.includes("updated")
    ) {
        return "success";
    }

    return "info";
};

const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, dispatch] = useReducer(toastReducer, []);

    const addToast = useCallback((title: string, body: string) => {
        const newToast = {
            id: toastId++,
            title,
            body,
            tone: inferToastTone(title, body),
        };
        dispatch({ type: "ADD_TOAST", toast: newToast });
    }, []);

    const removeToast = useCallback((id: number) => {
        dispatch({ type: "REMOVE_TOAST", id });
    }, []);

    const contextValue = useMemo(() => ({
        toasts,
        addToast,
        removeToast,
    }), [addToast, removeToast, toasts]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <ToastContainer
                className="app-toast"
                position="bottom-end"
            >
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        onClose={() => removeToast(toast.id)}
                        delay={3000}
                        autohide
                        animation
                        className={`app-toast__item app-toast__item--${toast.tone}`}
                    >
                        <Toast.Header className="app-toast__header" closeButton>
                            <span className="app-toast__badge" aria-hidden="true">
                                {toast.title.slice(0, 1).toUpperCase()}
                            </span>
                            <strong className="me-auto">{toast.title}</strong>
                        </Toast.Header>
                        <Toast.Body className="app-toast__body">{toast.body}</Toast.Body>
                    </Toast>
                ))}
            </ToastContainer>
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextProps => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

export default ToastProvider;
