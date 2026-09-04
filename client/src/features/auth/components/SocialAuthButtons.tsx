import React from "react";
import { Role } from "../../../utils/interface";
import { SocialAuthIntent } from "../utils/socialAuth";

type SocialAuthButtonsProps = {
    disabled?: boolean;
    intent: SocialAuthIntent;
    role: Role;
};

// Google OAuth was not migrated with the NestJS cutover. Do not render a
// control that sends users to a route the server does not provide. Restore
// this component when the complete OAuth strategy + account/session flow is
// ported and covered by integration tests.
const SocialAuthButtons: React.FC<SocialAuthButtonsProps> = () => null;

export default SocialAuthButtons;
