import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingScreen from "../../../components/common/LoadingScreen";
import { useAuth } from "../../../context/AuthContext";
import { Role } from "../../../types/user";
import { buildLoginRedirectPath } from "../authRedirect";

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
    const { userData, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <LoadingScreen variant="page" />;
    }

    if (!userData) {
        return <Navigate to={buildLoginRedirectPath(location)} replace />;
    }

    if (userData.role !== Role.Admin) {
        return <Navigate to="/403" replace />;
    }

    return <>{children}</>;
};

export default RequireAdmin;
