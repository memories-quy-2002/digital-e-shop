import { Link, useLocation } from "react-router-dom";
import { useT } from "../../../hooks/useT";
import { buildLoginRedirectPath } from "../../auth/authRedirect";

const ProductReviewLoginPrompt = () => {
    const t = useT();
    const location = useLocation();

    return (
        <div className="product-page__reviews-state">
            <Link to={buildLoginRedirectPath(location)}>{t("product.loginToReviewLink")}</Link>
            {t("product.loginToReviewAfter")}
        </div>
    );
};

export default ProductReviewLoginPrompt;
