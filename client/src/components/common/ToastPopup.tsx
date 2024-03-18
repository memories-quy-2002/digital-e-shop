import React, { useState } from "react";
import { Toast, ToastContainer } from "react-bootstrap";

interface ToastProps {
	isShow: boolean;
	msg: string | null;
}

const ToastPopup = ({ isShow, msg }: ToastProps) => {
	const [show, setShow] = useState<boolean>(isShow);
	return (
		<ToastContainer
			className="p-3"
			position="bottom-end"
			style={{ zIndex: 1 }}
		>
			<Toast
				show={show}
				onClose={() => setShow(false)}
				delay={5000}
				autohide
				animation
			>
				<Toast.Body>{msg}</Toast.Body>
			</Toast>
		</ToastContainer>
	);
};

export default ToastPopup;
