import { Button, Modal } from "../ui/legacy";

type ConfirmActionModalProps = {
    show: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    processingLabel?: string;
    confirmVariant?: string;
    isConfirming?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
};

const ConfirmActionModal = ({
    show,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    processingLabel = "Processing...",
    confirmVariant = "danger",
    isConfirming = false,
    onCancel,
    onConfirm,
}: ConfirmActionModalProps) => {
    return (
        <Modal show={show} onHide={onCancel} centered animation={false}>
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>{message}</Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
                    {cancelLabel}
                </Button>
                <Button variant={confirmVariant} onClick={onConfirm} disabled={isConfirming}>
                    {isConfirming ? processingLabel : confirmLabel}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default ConfirmActionModal;
