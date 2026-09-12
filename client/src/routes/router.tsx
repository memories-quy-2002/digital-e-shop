import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import withSessionCheck from "../features/auth/components/withSessionCheck";
import RequireAdmin from "../features/auth/components/RequireAdmin";
import LoadingScreen from "../components/common/LoadingScreen";
import ForbiddenPage from "../pages/ForbiddenPage";

const HomePage = lazy(() => import("../pages/HomePage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage"));
const SignupPage = lazy(() => import("../features/auth/pages/SignupPage"));
const VerifyEmailPage = lazy(() => import("../features/auth/pages/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("../features/auth/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("../features/auth/pages/ResetPasswordPage"));
const ProductPage = lazy(() => import("../features/products/pages/ProductPage"));
const WishlistPage = lazy(() => import("../pages/WishlistPage"));
const ShopsPage = lazy(() => import("../pages/ShopsPage"));
const AboutUsPage = lazy(() => import("../pages/AboutUsPage"));
const ContactUsPage = lazy(() => import("../pages/ContactUsPage"));
const NewsPage = lazy(() => import("../pages/NewsPage"));
const NewsArticlePage = lazy(() => import("../pages/NewsArticlePage"));
const SupportPage = lazy(() => import("../pages/SupportPage"));
const AdminSupportPage = lazy(() => import("../features/admin/pages/AdminSupportPage"));
const CartPage = lazy(() => import("../features/orders/pages/CartPage"));
const CheckoutSuccessPage = lazy(() => import("../features/orders/pages/CheckoutSuccessPage"));
const MockPayOSCheckoutPage = lazy(() => import("../features/orders/pages/MockPayOSCheckoutPage"));
const GuestOrderLookupPage = lazy(() => import("../features/orders/pages/GuestOrderLookupPage"));
const OrderHistoryPage = lazy(() => import("../features/orders/pages/OrderHistoryPage"));
const CustomerAccountPage = lazy(() => import("../features/users/pages/CustomerAccountPage"));
const AddressBookPage = lazy(() => import("../features/users/pages/AddressBookPage"));
const AdminDashboard = lazy(() => import("../features/admin/pages/AdminDashboard"));
const AdminProductPage = lazy(() => import("../features/admin/pages/AdminProductPage"));
const AdminOrderPage = lazy(() => import("../features/admin/pages/AdminOrderPage"));
const AdminAccountPage = lazy(() => import("../features/admin/pages/AdminAccountPage"));
const AdminPromotionsPage = lazy(() => import("../features/admin/pages/AdminPromotionsPage"));
const AdminAddProductPage = lazy(() => import("../features/admin/pages/AdminAddProductPage"));

const ProtectedCustomerAccountPage = withSessionCheck(CustomerAccountPage);
const ProtectedOrderHistoryPage = withSessionCheck(OrderHistoryPage);
const ProtectedAddressBookPage = withSessionCheck(AddressBookPage);
const ProtectedWishlistPage = withSessionCheck(WishlistPage);

const AppRouter = () => {
    return (
        <Suspense fallback={<LoadingScreen variant="page" />}>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/product" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/guest-order" element={<GuestOrderLookupPage />} />
                <Route path="/about-us" element={<AboutUsPage />} />
                <Route path="/contact-us" element={<ContactUsPage />} />
                <Route path="/wishlist" element={<ProtectedWishlistPage />} />
                <Route path="/shops" element={<ShopsPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/news/:slug" element={<NewsArticlePage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/checkout-success" element={<CheckoutSuccessPage />} />
                <Route path="/mock-payos-checkout" element={<MockPayOSCheckoutPage />} />
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="/account" element={<ProtectedCustomerAccountPage />} />
                <Route path="/orders" element={<ProtectedOrderHistoryPage />} />
                <Route path="/addresses" element={<ProtectedAddressBookPage />} />
                <Route path="/notifications" element={<Navigate to="/account#notifications" replace />} />
                <Route
                    path="/admin"
                    element={
                        <RequireAdmin>
                            <AdminDashboard />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/notifications"
                    element={
                        <RequireAdmin>
                            <Navigate to="/admin" replace />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/support"
                    element={
                        <RequireAdmin>
                            <AdminSupportPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/products"
                    element={
                        <RequireAdmin>
                            <AdminProductPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/orders"
                    element={
                        <RequireAdmin>
                            <AdminOrderPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/accounts"
                    element={
                        <RequireAdmin>
                            <AdminAccountPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/promotions"
                    element={
                        <RequireAdmin>
                            <AdminPromotionsPage />
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/add"
                    element={
                        <RequireAdmin>
                            <AdminAddProductPage />
                        </RequireAdmin>
                    }
                />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default AppRouter;
