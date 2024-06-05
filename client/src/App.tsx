import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import CartPage from "./components/pages/CartPage";
import CheckoutSuccessPage from "./components/pages/CheckoutSuccessPage";
import HomePage from "./components/pages/HomePage";
import LoginPage from "./components/pages/LoginPage";
import ProductPage from "./components/pages/ProductPage";
import ShopsPage from "./components/pages/ShopsPage";
import SignupPage from "./components/pages/SignupPage";
import WishlistPage from "./components/pages/WishlistPage";
import AdminProductPage from "./components/pages/admin/AdminProductPage";
import AdminOrderPage from "./components/pages/admin/AdminOrderPage";
import AdminAccountPage from "./components/pages/admin/AdminAccountPage";
import AdminAddProductPage from "./components/pages/admin/AdminAddProductPage";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/product" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/wishlist" element={<WishlistPage />} />
                <Route path="/shops" element={<ShopsPage />} />
                <Route path="/admin/product" element={<AdminProductPage />} />
                <Route path="/admin/order" element={<AdminOrderPage />} />
                <Route path="/admin/account" element={<AdminAccountPage />} />
                <Route path="/admin/add" element={<AdminAddProductPage />} />
                <Route
                    path="/checkout-success"
                    element={<CheckoutSuccessPage />}
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
