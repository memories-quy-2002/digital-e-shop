import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import ToastProvider from "../context/ToastContext";
import AdminProductPage from "../components/pages/admin/AdminProductPage";
import AdminOrderPage from "../components/pages/admin/AdminOrderPage";
import AdminCustomerPage from "../components/pages/admin/AdminAccountPage";
import AdminAddProductPage from "../components/pages/admin/AdminAddProductPage";

describe("AdminDashboard", () => {
    it("matches the AdminDashboard snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/admin"]}>
                    <Routes>
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/admin/products" element={<AdminProductPage />} />
                        <Route path="/admin/orders" element={<AdminOrderPage />} />
                        <Route path="/admin/customers" element={<AdminCustomerPage />} />
                        <Route path="/admin/add" element={<AdminAddProductPage />} />
                    </Routes>
                    <AdminDashboard />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });
});
