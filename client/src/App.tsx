import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import CartPage from "./components/pages/CartPage";
import CategoryPage from "./components/pages/CategoryPage";
import CheckoutSuccessPage from "./components/pages/CheckoutSuccessPage";
import HomePage from "./components/pages/HomePage";
import LoginPage from "./components/pages/LoginPage";
import ProductPage from "./components/pages/ProductPage";
import SignupPage from "./components/pages/SignupPage";
import WishlistPage from "./components/pages/WishlistPage";

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
				<Route
					path="/smartphones"
					element={<CategoryPage category="smartphones" />}
				/>
				<Route
					path="/televisions"
					element={<CategoryPage category="televisions" />}
				/>
				<Route
					path="/laptops"
					element={<CategoryPage category="laptops" />}
				/>
				<Route
					path="/cameras"
					element={<CategoryPage category="cameras" />}
				/>

				<Route
					path="/checkout-success"
					element={<CheckoutSuccessPage />}
				/>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
