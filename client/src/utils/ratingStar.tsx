import React from "react";
import { StarIcon, StarFillIcon, StarHalfIcon } from "../components/common/Icons";

const ratingStar = (overallScore: number, color: string = "#FFCC4A", size: number = 18) => {
    const stars = [];
    const maxStars = 5;

    for (let i = 1; i <= maxStars; i++) {
        if (i <= overallScore) {
            stars.push(
                <div key={i} data-testid="starBtn" className="d-flex align-items-center">
                    <StarFillIcon color={color} size={size} />
                </div>,
            ); // Full star
        } else if (i - 1 < overallScore && overallScore < i) {
            stars.push(
                <div key={i} className="d-flex align-items-center">
                    <StarHalfIcon color={color} size={size} />
                </div>,
            ); // Half star
        } else {
            stars.push(
                <div key={i} className="d-flex align-items-center">
                    <StarIcon color={color} size={size} />
                </div>,
            ); // Empty star
        }
    }

    return stars;
};
export default ratingStar;
