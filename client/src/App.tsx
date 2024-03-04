import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import HomePage from "./components/pages/HomePage";
import LoginPage from "./components/pages/LoginPage";
import SignupPage from "./components/pages/SignupPage";
import ProductPage from "./components/pages/ProductPage";

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/login" element={<LoginPage />} />
				<Route path="/signup" element={<SignupPage />} />
				{/* <Route path="/product" element={<ProductPage />} />
				<Route path="/cart" element={<ProductPage />} /> */}
			</Routes>
		</BrowserRouter>
	);
}

export default App;
