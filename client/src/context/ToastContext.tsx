import React, { createContext, useCallback, useContext, useMemo, useReducer, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Toast, ToastContainer } from "../components/ui/legacy";
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
            return [...state, action.toast].slice(-MAX_VISIBLE_TOASTS);
        case "REMOVE_TOAST":
            return state.filter((toast) => toast.id !== action.id);
        default:
            return state;
    }
};

let toastId = 1;
const MAX_VISIBLE_TOASTS = 3;

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

const toastMarkers: Record<ToastMessage["tone"], string> = {
    success: "✓",
    error: "!",
    info: "i",
};

const toastToneLabels: Record<ToastMessage["tone"], string> = {
    success: "Success",
    error: "Action needed",
    info: "Information",
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
            {typeof document === "undefined"
                ? null
                : createPortal(
                      <ToastContainer
                          className={`app-toast${toasts.length > 0 ? " app-toast--open" : ""}`}
                          role="region"
                          aria-label="Notifications"
                          aria-live="polite"
                      >
                          {toasts.map((toast) => (
                              <Toast
                                  key={toast.id}
                                  onClose={() => removeToast(toast.id)}
                                  delay={toast.tone === "error" ? 5000 : 4000}
                                  autohide
                                  animation
                                  className={`app-toast__item app-toast__item--${toast.tone}`}
                              >
                                  <Toast.Header className="app-toast__header" closeButton>
                                      <span className="app-toast__badge" aria-hidden="true">
                                          {toastMarkers[toast.tone]}
                                      </span>
                                      <span className="app-toast__heading">
                                          <span className="app-toast__tone">{toastToneLabels[toast.tone]}</span>
                                          <strong>{toast.title}</strong>
                                      </span>
                                  </Toast.Header>
                                  <Toast.Body className="app-toast__body">{toast.body}</Toast.Body>
                              </Toast>
                          ))}
                      </ToastContainer>,
                      document.body,
                  )}
            {children}
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
