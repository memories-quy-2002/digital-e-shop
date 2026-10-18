import { useEffect, useState } from "react";
import "../../styles/layout/_back-to-top.scss";
import { useT } from "../../hooks/useT";

const VISIBILITY_THRESHOLD = 320;

const BackToTopButton = () => {
    const t = useT();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const updateVisibility = () => setIsVisible(window.scrollY > VISIBILITY_THRESHOLD);

        updateVisibility();
        window.addEventListener("scroll", updateVisibility, { passive: true });

        return () => window.removeEventListener("scroll", updateVisibility);
    }, []);

    const handleClick = () => {
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion) {
            window.scrollTo(0, 0);
            return;
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (!isVisible) {
        return null;
    }

    return (
        <button className="back-to-top" type="button" onClick={handleClick}>
            <span>{t("footer.backToTop")}</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
                <path d="M8 13V3m0 0L4 7m4-4 4 4" />
            </svg>
        </button>
    );
};

export default BackToTopButton;
