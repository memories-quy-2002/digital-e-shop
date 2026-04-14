import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number;
}

const Svg = ({
    size = 24,
    viewBox = "0 0 24 24",
    children,
    ...props
}: IconProps & { viewBox?: string; children: React.ReactNode }) => (
    <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
    >
        {children}
    </svg>
);

const FillSvg = ({
    size = 24,
    viewBox = "0 0 24 24",
    children,
    ...props
}: IconProps & { viewBox?: string; children: React.ReactNode }) => (
    <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
    >
        {children}
    </svg>
);

export const ArrowLeftIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M15 18l-6-6 6-6" />
    </Svg>
);

export const ArrowRightIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M9 6l6 6-6 6" />
    </Svg>
);

export const ArrowUpIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M6 14l6-6 6 6" />
    </Svg>
);

export const ArrowDownIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M6 10l6 6 6-6" />
    </Svg>
);

export const HeartIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </Svg>
);

export const HeartFillIcon = (props: IconProps) => (
    <FillSvg {...props}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </FillSvg>
);

export const StarIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </Svg>
);

export const StarFillIcon = (props: IconProps) => (
    <FillSvg {...props}>
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </FillSvg>
);

export const StarHalfIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27V2z" fill="currentColor" />
        <path d="M12 2L14.81 8.63 22 9.24l-5.46 4.73L18.18 21 12 17.27V2z" />
    </Svg>
);

export const CheckCircleIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
    </Svg>
);

export const XCircleIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M15 9l-6 6m6 0l-6-6" />
        <circle cx="12" cy="12" r="9" />
    </Svg>
);

export const BankIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M4 10h16" />
        <path d="M6 10v8" />
        <path d="M10 10v8" />
        <path d="M14 10v8" />
        <path d="M18 10v8" />
        <path d="M12 4L4 10h16L12 4z" />
    </Svg>
);

export const CreditCardIcon = (props: IconProps) => (
    <Svg {...props}>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M3 11h18" />
        <path d="M7 15h4" />
    </Svg>
);

export const BitcoinIcon = (props: IconProps) => (
    <Svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10" />
        <path d="M10 8h4m-4 4h4" />
    </Svg>
);

export const CartIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M6 6h15l-1.5 9H8.5L6 6z" />
        <path d="M6 6l-2-4H1" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
    </Svg>
);

export const BoxSeamIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" />
        <path d="M12 3v18" />
        <path d="M3 8l9 5 9-5" />
    </Svg>
);

export const PersonIcon = (props: IconProps) => (
    <Svg {...props}>
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </Svg>
);

export const SpeedometerIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M4 12a8 8 0 1 1 16 0" />
        <path d="M12 12l4-4" />
        <path d="M12 12h.01" />
    </Svg>
);

export const EnvelopeIcon = (props: IconProps) => (
    <Svg {...props}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 6l9 7 9-7" />
    </Svg>
);

export const HouseIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" />
        <path d="M9 22V12h6v10" />
    </Svg>
);

export const HouseFillIcon = (props: IconProps) => (
    <FillSvg {...props}>
        <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" />
        <path d="M9 22V12h6v10" fill="white" />
    </FillSvg>
);

export const TelephoneIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.12.8.32 1.56.6 2.28a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.72.28 1.48.48 2.28.6A2 2 0 0 1 22 16.92z" />
    </Svg>
);

export const FacebookIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2z" />
    </Svg>
);

export const TwitterIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M22 4.01c-.8.36-1.66.61-2.57.72a4.51 4.51 0 0 0 1.98-2.49 9.21 9.21 0 0 1-2.86 1.1 4.53 4.53 0 0 0-7.72 4.13A12.85 12.85 0 0 1 3.16 3.5a4.52 4.52 0 0 0 1.4 6.04 4.49 4.49 0 0 1-2.05-.57v.06a4.53 4.53 0 0 0 3.63 4.44 4.5 4.5 0 0 1-2.04.08 4.53 4.53 0 0 0 4.23 3.14A9.08 9.08 0 0 1 2 19.54a12.82 12.82 0 0 0 6.92 2.03c8.3 0 12.84-6.88 12.84-12.84 0-.2 0-.4-.01-.6A9.18 9.18 0 0 0 22 4.01z" />
    </Svg>
);

export const InstagramIcon = (props: IconProps) => (
    <Svg {...props} viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.5" cy="6.5" r="1" />
    </Svg>
);

export const LinkedinIcon = (props: IconProps) => (
    <Svg {...props} viewBox="0 0 24 24">
        <path d="M4 4h16v16H4z" />
        <path d="M8 9.5v7" />
        <path d="M8 7h.01" />
        <path d="M12 16.5v-4a1.5 1.5 0 0 1 3 0v4" />
        <path d="M12 12h3" />
    </Svg>
);

export const BellIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M18 14v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
);

export const BoxArrowRightIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M19 4v16" />
    </Svg>
);

export const SearchIcon = (props: IconProps) => (
    <Svg {...props}>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
    </Svg>
);

export const CashStackIcon = (props: IconProps) => (
    <Svg {...props}>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M8 11h8" />
        <path d="M8 15h8" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
    </Svg>
);

export const TrashIcon = (props: IconProps) => (
    <Svg {...props}>
        <path d="M6 7h12" />
        <path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
        <path d="M8 7v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
    </Svg>
);
