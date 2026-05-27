import React, { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import withSessionCheck from "../features/auth/components/withSessionCheck";
import LoadingScreen from "../components/common/LoadingScreen";

const HomePage = lazy(() => import("../pages/HomePage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage"));
const SignupPage = lazy(() => import("../features/auth/pages/SignupPage"));
const ProductPage = lazy(() => import("../features/products/pages/ProductPage"));
const WishlistPage = lazy(() => import("../pages/WishlistPage"));
const ShopsPage = lazy(() => import("../pages/ShopsPage"));
const AboutUsPage = lazy(() => import("../pages/AboutUsPage"));
const ContactUsPage = lazy(() => import("../pages/ContactUsPage"));
const NewsPage = lazy(() => import("../pages/NewsPage"));
const SupportPage = lazy(() => import("../pages/SupportPage"));
const CartPage = lazy(() => import("../features/orders/pages/CartPage"));
const CheckoutSuccessPage = lazy(() => import("../features/orders/pages/CheckoutSuccessPage"));
const OrderHistoryPage = lazy(() => import("../features/orders/pages/OrderHistoryPage"));
const CustomerAccountPage = lazy(() => import("../features/users/pages/CustomerAccountPage"));
const AddressBookPage = lazy(() => import("../features/users/pages/AddressBookPage"));
const CustomerNotificationsPage = lazy(() => import("../features/users/pages/CustomerNotificationsPage"));
const AdminDashboard = lazy(() => import("../features/admin/pages/AdminDashboard"));
const AdminNotificationsPage = lazy(() => import("../features/admin/pages/AdminNotificationsPage"));
const AdminProductPage = lazy(() => import("../features/admin/pages/AdminProductPage"));
const AdminOrderPage = lazy(() => import("../features/admin/pages/AdminOrderPage"));
const AdminAccountPage = lazy(() => import("../features/admin/pages/AdminAccountPage"));
const AdminPromotionsPage = lazy(() => import("../features/admin/pages/AdminPromotionsPage"));
const AdminAddProductPage = lazy(() => import("../features/admin/pages/AdminAddProductPage"));

const ProtectedCartPage = withSessionCheck(CartPage);
const ProtectedCheckoutSuccessPage = withSessionCheck(CheckoutSuccessPage);
const ProtectedCustomerAccountPage = withSessionCheck(CustomerAccountPage);
const ProtectedOrderHistoryPage = withSessionCheck(OrderHistoryPage);
const ProtectedAddressBookPage = withSessionCheck(AddressBookPage);
const ProtectedCustomerNotificationsPage = withSessionCheck(CustomerNotificationsPage);
const ProtectedWishlistPage = withSessionCheck(WishlistPage);
const ProtectedAdminDashboard = withSessionCheck(AdminDashboard);
const ProtectedAdminNotificationsPage = withSessionCheck(AdminNotificationsPage);
const ProtectedAdminProductPage = withSessionCheck(AdminProductPage);
const ProtectedAdminAccountPage = withSessionCheck(AdminAccountPage);
const ProtectedAdminOrderPage = withSessionCheck(AdminOrderPage);
const ProtectedAdminPromotionsPage = withSessionCheck(AdminPromotionsPage);

const AppRouter = () => {
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
                <Route path="/account" element={<ProtectedCustomerAccountPage />} />
                <Route path="/orders" element={<ProtectedOrderHistoryPage />} />
                <Route path="/addresses" element={<ProtectedAddressBookPage />} />
                <Route path="/notifications" element={<ProtectedCustomerNotificationsPage />} />
                <Route path="/admin" element={<ProtectedAdminDashboard />} />
                <Route path="/admin/notifications" element={<ProtectedAdminNotificationsPage />} />
                <Route path="/admin/products" element={<ProtectedAdminProductPage />} />
                <Route path="/admin/orders" element={<ProtectedAdminOrderPage />} />
                <Route path="/admin/accounts" element={<ProtectedAdminAccountPage />} />
                <Route path="/admin/promotions" element={<ProtectedAdminPromotionsPage />} />
                <Route path="/admin/add" element={<AdminAddProductPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
};

export default AppRouter;
