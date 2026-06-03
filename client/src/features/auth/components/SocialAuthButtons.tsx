import React from "react";
import { Role } from "../../../utils/interface";
import { SocialAuthIntent, SocialProvider, startSocialAuth } from "../utils/socialAuth";

type SocialAuthButtonsProps = {
    disabled?: boolean;
    intent: SocialAuthIntent;
    role: Role;
};

const socialProviders: Array<{ id: SocialProvider; label: string }> = [
    { id: "google", label: "Continue with Google" },
];

const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = ({ disabled = false, intent, role }) => (
    <div className="auth-social" aria-label="Social login options">
        <div className="auth-social__divider">
            <span>Customer social access</span>
        </div>
        <div className="auth-social__actions">
            {socialProviders.map((provider) => (
                <button
                    key={provider.id}
                    className="auth-social__button"
                    type="button"
                    disabled={disabled}
                    onClick={() => startSocialAuth(provider.id, role, intent)}
                >
                    {provider.label}
                </button>
            ))}
        </div>
        {disabled ? (
            <p className="auth-social__hint">Social login is available for customer accounts only.</p>
        ) : null}
    </div>
);

export default SocialAuthButtons;
