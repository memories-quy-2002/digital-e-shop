import { Button, Modal } from "../ui/legacy";

type AdminLogoutConfirmProps = {
    onHide: () => void;
    onConfirm: () => void | Promise<void>;
    tx: (key: string) => string;
};

/** Only load the confirmation dialog when the admin requests to sign out. */
export default function AdminLogoutConfirm({ onHide, onConfirm, tx }: AdminLogoutConfirmProps) {
    return (
        <Modal show onHide={onHide} animation={false}>
            <Modal.Header closeButton>
                <Modal.Title>{tx("Logout")}</Modal.Title>
            </Modal.Header>
            <Modal.Body>{tx("Are you sure you want to logout?")}</Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>{tx("Cancel")}</Button>
                <Button variant="primary" onClick={onConfirm}>{tx("Logout")}</Button>
            </Modal.Footer>
        </Modal>
    );
}
