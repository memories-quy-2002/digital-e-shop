import { useEffect, useRef, useState } from "react";
import "../../styles/layout/_back-to-top.scss";
import { useT } from "../../hooks/useT";

const VISIBILITY_THRESHOLD = 320;

const BackToTopButton = () => {
    const t = useT();
    const [isVisible, setIsVisible] = useState(false);
    const sentinelRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const sentinel = sentinelRef.current;

        if (sentinel && typeof IntersectionObserver !== "undefined") {
            const observer = new IntersectionObserver(
                ([entry]) => setIsVisible(!entry.isIntersecting),
                { rootMargin: `${VISIBILITY_THRESHOLD}px 0px 0px 0px` },
            );

            observer.observe(sentinel);
            return () => observer.disconnect();
        }

        let lastVisibility = false;
        let scheduledFrame: number | null = null;

        const updateVisibility = () => {
            scheduledFrame = null;
            const nextVisibility = window.scrollY > VISIBILITY_THRESHOLD;

            if (nextVisibility === lastVisibility) return;

            lastVisibility = nextVisibility;
            setIsVisible(nextVisibility);
        };

        const scheduleVisibilityUpdate = () => {
            if (scheduledFrame !== null) return;
            scheduledFrame = window.requestAnimationFrame(updateVisibility);
        };

        window.addEventListener("scroll", scheduleVisibilityUpdate, { passive: true });
        scheduleVisibilityUpdate();

        return () => {
            window.removeEventListener("scroll", scheduleVisibilityUpdate);
            if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
        };
    }, []);

    const handleClick = () => {
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion) {
            window.scrollTo(0, 0);
            return;
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <>
            <span ref={sentinelRef} className="back-to-top__sentinel" aria-hidden="true" />
            {isVisible && (
                <button className="back-to-top" type="button" onClick={handleClick}>
                    <span>{t("footer.backToTop")}</span>
                    <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
                        <path d="M8 13V3m0 0L4 7m4-4 4 4" />
                    </svg>
                </button>
            )}
        </>
    );
};

export default BackToTopButton;
