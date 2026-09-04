import React, { useEffect } from "react";
import { Modal } from "../ui/legacy";
import { useT } from "../../hooks/useT";

type ImageLightboxProps = {
    show: boolean;
    onHide: () => void;
    src?: string;
    srcSet?: string;
    sizes?: string;
    alt: string;
};

const ImageLightbox: React.FC<ImageLightboxProps> = ({ show, onHide, src, srcSet, sizes, alt }) => {
    const t = useT();
    useEffect(() => {
        if (!show) {
            return undefined;
        }
        const handler = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onHide();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [show, onHide]);

    if (!src) {
        return null;
    }

    return (
        <Modal
            show={show}
            onHide={onHide}
            centered
            size="xl"
            contentClassName="image-lightbox__content"
            dialogClassName="image-lightbox__dialog"
        >
            <Modal.Body>
                <button
                    type="button"
                    className="image-lightbox__close"
                    onClick={onHide}
                    aria-label={t("product.lightboxClose")}
                >
                    ×
                </button>
                <img
                    src={src}
                    srcSet={srcSet}
                    sizes={sizes}
                    alt={alt}
                    className="image-lightbox__img"
                    loading="eager"
                    decoding="async"
                />
            </Modal.Body>
        </Modal>
    );
};

export default ImageLightbox;
