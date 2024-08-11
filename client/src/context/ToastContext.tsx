// ToastContext.tsx
import React, { createContext, useContext, useReducer, ReactNode } from "react";
import { Toast, ToastContainer } from "react-bootstrap";

interface ToastMessage {
    id: number;
    title: string;
    body: string;
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

const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, dispatch] = useReducer(toastReducer, []);

    const addToast = (title: string, body: string) => {
        const newToast = {
            id: toastId++,
            title,
            body,
        };
        dispatch({ type: "ADD_TOAST", toast: newToast });
    };

    const removeToast = (id: number) => {
        dispatch({ type: "REMOVE_TOAST", id });
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer
                className="p-3"
                position="bottom-end"
                style={{
                    zIndex: 1,
                    position: "fixed",
                    bottom: 0,
                    right: 0,
                }}
            >
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        onClose={() => removeToast(toast.id)}
                        delay={3000}
                        autohide
                        animation
                    >
                        <Toast.Header>
                            <strong className="me-auto">{toast.title}</strong>
                            <small>just now</small>
                        </Toast.Header>
                        <Toast.Body>{toast.body}</Toast.Body>
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
