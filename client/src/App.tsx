import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import withSessionCheck from "./components/common/withSessionCheck";
import CartPage from "./components/pages/CartPage";
import CheckoutSuccessPage from "./components/pages/CheckoutSuccessPage";
import HomePage from "./components/pages/HomePage";
import LoginPage from "./components/pages/LoginPage";
import NoPage from "./components/pages/NoPage";
import ProductPage from "./components/pages/ProductPage";
import ShopsPage from "./components/pages/ShopsPage";
import SignupPage from "./components/pages/SignupPage";
import WishlistPage from "./components/pages/WishlistPage";
import AdminAddProductPage from "./components/pages/admin/AdminAddProductPage";
import AdminCustomerPage from "./components/pages/admin/AdminCustomerPage";
import AdminDashboard from "./components/pages/admin/AdminDashboard";
import AdminOrderPage from "./components/pages/admin/AdminOrderPage";
import AdminProductPage from "./components/pages/admin/AdminProductPage";
import ToastProvider from "./context/ToastContext";
import UserDataProvider from "./context/UserDataContext";
import AboutUsPage from "./components/pages/AboutUsPage";
import ContactUsPage from "./components/pages/ContactUsPage";

const ProtectedHomePage = withSessionCheck(HomePage);
const ProtectedCartPage = withSessionCheck(CartPage);
const ProtectedCheckoutSuccessPage = withSessionCheck(CheckoutSuccessPage);
const ProtectedWishlistPage = withSessionCheck(WishlistPage);
const ProtectedAdminDashboard = withSessionCheck(AdminDashboard);
const ProtectedAdminProductPage = withSessionCheck(AdminProductPage);
const ProtectedAdminCustomerPage = withSessionCheck(AdminCustomerPage);
const ProtectedAdminOrderPage = withSessionCheck(AdminOrderPage);

function App() {
    return (
        <UserDataProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" index element={<ProtectedHomePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignupPage />} />
                        <Route path="/product" element={<ProductPage />} />
                        <Route path="/cart" element={<ProtectedCartPage />} />
                        <Route path="/about-us" element={<AboutUsPage />} />
                        <Route path="/contact-us" element={<ContactUsPage />} />
                        <Route
                            path="/wishlist"
                            element={<ProtectedWishlistPage />}
                        />
                        <Route path="/shops" element={<ShopsPage />} />
                        <Route
                            path="/checkout-success"
                            element={<ProtectedCheckoutSuccessPage />}
                        />
                        <Route
                            path="/admin"
                            element={<ProtectedAdminDashboard />}
                        />
                        <Route
                            path="/admin/products"
                            element={<ProtectedAdminProductPage />}
                        />
                        <Route
                            path="/admin/orders"
                            element={<ProtectedAdminOrderPage />}
                        />
                        <Route
                            path="/admin/customers"
                            element={<ProtectedAdminCustomerPage />}
                        />
                        <Route
                            path="/admin/add"
                            element={<AdminAddProductPage />}
                        />
                        <Route path="*" element={<NoPage />} />
                    </Routes>
                </BrowserRouter>
            </ToastProvider>
        </UserDataProvider>
    );
}

export default App;
