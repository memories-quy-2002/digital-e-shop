import { useEffect, useRef } from "react";

const LazyLoadImage = ({
    src,
    alt,
    style,
    onError,
}: {
    src: string;
    alt: string;
    style?: React.CSSProperties;
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) => {
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && imgRef.current) {
                        imgRef.current.src = imgRef.current.dataset.src!;
                        observer.unobserve(imgRef.current);
                    }
                });
            },
            { threshold: 0.05 }, // Load when 10% of the image is visible
        );

        if (imgRef.current) observer.observe(imgRef.current);
    }, []);

    return <img ref={imgRef} data-src={src} alt={alt} loading="lazy" style={style} onError={onError} />;
};
export default LazyLoadImage;
