import React, { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import withSessionCheck from "../components/common/withSessionCheck";
import LoadingScreen from "../components/common/LoadingScreen";

const HomePage = lazy(() => import("../components/pages/HomePage"));
const LoginPage = lazy(() => import("../components/pages/LoginPage"));
const SignupPage = lazy(() => import("../components/pages/SignupPage"));
const ProductPage = lazy(() => import("../components/pages/ProductPage"));
const CartPage = lazy(() => import("../components/pages/CartPage"));
const AboutUsPage = lazy(() => import("../components/pages/AboutUsPage"));
const ContactUsPage = lazy(() => import("../components/pages/ContactUsPage"));
const WishlistPage = lazy(() => import("../components/pages/WishlistPage"));
const ShopsPage = lazy(() => import("../components/pages/ShopsPage"));
const NewsPage = lazy(() => import("../components/pages/NewsPage"));
const SupportPage = lazy(() => import("../components/pages/SupportPage"));
const CheckoutSuccessPage = lazy(() => import("../components/pages/CheckoutSuccessPage"));
const AdminDashboard = lazy(() => import("../components/pages/admin/AdminDashboard"));
const AdminProductPage = lazy(() => import("../components/pages/admin/AdminProductPage"));
const AdminOrderPage = lazy(() => import("../components/pages/admin/AdminOrderPage"));
const AdminAccountPage = lazy(() => import("../components/pages/admin/AdminAccountPage"));
const AdminAddProductPage = lazy(() => import("../components/pages/admin/AdminAddProductPage"));
const NoPage = lazy(() => import("../components/pages/NoPage"));

const ProtectedCartPage = withSessionCheck(CartPage);
const ProtectedCheckoutSuccessPage = withSessionCheck(CheckoutSuccessPage);
const ProtectedWishlistPage = withSessionCheck(WishlistPage);
const ProtectedAdminDashboard = withSessionCheck(AdminDashboard);
const ProtectedAdminProductPage = withSessionCheck(AdminProductPage);
const ProtectedAdminAccountPage = withSessionCheck(AdminAccountPage);
const ProtectedAdminOrderPage = withSessionCheck(AdminOrderPage);

const AppRoutes = () => {
    return (
        <Suspense fallback={<LoadingScreen />}>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/product" element={<ProductPage />} />
                <Route path="/cart" element={<ProtectedCartPage />} />
                <Route path="/about-us" element={<AboutUsPage />} />
                <Route path="/contact-us" element={<ContactUsPage />} />
                <Route path="/wishlist" element={<ProtectedWishlistPage />} />
                <Route path="/shops" element={<ShopsPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/checkout-success" element={<ProtectedCheckoutSuccessPage />} />
                <Route path="/admin" element={<ProtectedAdminDashboard />} />
                <Route path="/admin/products" element={<ProtectedAdminProductPage />} />
                <Route path="/admin/orders" element={<ProtectedAdminOrderPage />} />
                <Route path="/admin/accounts" element={<ProtectedAdminAccountPage />} />
                <Route path="/admin/add" element={<AdminAddProductPage />} />
                <Route path="*" element={<NoPage />} />
            </Routes>
        </Suspense>
    );
};

export default AppRoutes;
