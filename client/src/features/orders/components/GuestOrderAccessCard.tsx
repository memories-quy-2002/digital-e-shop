import { useState } from "react";
import { useT } from "../../../hooks/useT";

type Props = { orderId: string; guestOrderToken: string };

const GuestOrderAccessCard = ({ orderId, guestOrderToken }: Props) => {
    const t = useT();
    const [showToken, setShowToken] = useState(false);
    const [copyStatus, setCopyStatus] = useState("checkoutSuccess.copyAccessToken");

    const copyToken = async () => {
        try {
            await navigator.clipboard.writeText(guestOrderToken);
            setCopyStatus("checkoutSuccess.copied");
        } catch {
            setCopyStatus("checkoutSuccess.copyFailed");
        }
    };

    return (
        <section className="success__guest-access" aria-label={t("checkoutSuccess.guestAccessTitle")}>
            <div>
                <span className="success__guest-access__eyebrow">{t("checkoutSuccess.guestAccessTitle")}</span>
                <h2>{t("checkoutSuccess.saveDetails")}</h2>
                <p>{t("checkoutSuccess.accessTokenWarning")}</p>
            </div>
            <div className="success__guest-access__fields">
                <label>
                    <span>{t("checkoutSuccess.orderId")}</span>
                    <input readOnly value={orderId} aria-label={t("checkoutSuccess.orderId")} />
                </label>
                <label>
                    <span>{t("checkoutSuccess.accessToken")}</span>
                    <input
                        readOnly
                        type={showToken ? "text" : "password"}
                        value={guestOrderToken}
                        aria-label={t("checkoutSuccess.accessToken")}
                    />
                </label>
                <div className="success__guest-access__actions">
                    <button type="button" onClick={() => setShowToken((visible) => !visible)} aria-pressed={showToken}>
                        {showToken ? t("checkoutSuccess.hideToken") : t("checkoutSuccess.revealToken")}
                    </button>
                    <button type="button" onClick={() => void copyToken()}>{t(copyStatus)}</button>
                </div>
            </div>
        </section>
    );
};

export default GuestOrderAccessCard;
