import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import axios from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import Layout from "../layout/Layout";
import "../../styles/AddressBookPage.scss";

type Address = {
    id: number;
    label: string;
    recipient_name: string | null;
    phone_number: string | null;
    address_line: string;
    city: string | null;
    country: string | null;
    is_default: boolean;
};

type AddressForm = {
    id?: number;
    label: string;
    recipientName: string;
    phoneNumber: string;
    addressLine: string;
    city: string;
    country: string;
    isDefault: boolean;
};

const emptyForm: AddressForm = {
    label: "Home",
    recipientName: "",
    phoneNumber: "",
    addressLine: "",
    city: "",
    country: "",
    isDefault: false,
};

const AddressBookPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [form, setForm] = useState<AddressForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const fetchAddresses = async () => {
        if (!uid) return;
        try {
            const response = await axios.get(`/api/users/${uid}/addresses`);
            setAddresses(response.data.addresses || []);
        } catch {
            addToast("Address book", "Unable to load saved addresses.");
        }
    };

    useEffect(() => {
        fetchAddresses();
    }, [uid]);

    const handleEdit = (address: Address) => {
        setForm({
            id: address.id,
            label: address.label || "Shipping address",
            recipientName: address.recipient_name || "",
            phoneNumber: address.phone_number || "",
            addressLine: address.address_line || "",
            city: address.city || "",
            country: address.country || "",
            isDefault: address.is_default,
        });
    };

    const handleSubmit = async () => {
        if (!uid) return;
        if (!form.addressLine.trim()) {
            addToast("Address book", "Address line is required.");
            return;
        }

        try {
            setIsSaving(true);
            const payload = {
                label: form.label,
                recipientName: form.recipientName,
                phoneNumber: form.phoneNumber,
                addressLine: form.addressLine,
                city: form.city,
                country: form.country,
                isDefault: form.isDefault,
            };
            if (form.id) {
                await axios.put(`/api/users/${uid}/addresses/${form.id}`, payload);
                addToast("Address book", "Address updated.");
            } else {
                await axios.post(`/api/users/${uid}/addresses`, payload);
                addToast("Address book", "Address saved.");
            }
            setForm(emptyForm);
            fetchAddresses();
        } catch (err: any) {
            addToast("Address book", err?.response?.data?.msg || "Unable to save address.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (addressId: number) => {
        if (!uid) return;
        try {
            await axios.delete(`/api/users/${uid}/addresses/${addressId}`);
            addToast("Address book", "Address removed.");
            fetchAddresses();
        } catch {
            addToast("Address book", "Unable to remove address.");
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>Address Book | Digital-E</title>
                <meta name="description" content="Manage saved shipping addresses." />
            </Helmet>
            <main className="address-book">
                <header className="address-book__header">
                    <span>Account</span>
                    <h1>Address book</h1>
                    <p>Save delivery addresses and select a default address for faster checkout.</p>
                </header>

                <section className="address-book__layout">
                    <div className="address-book__form">
                        <h2>{form.id ? "Edit address" : "Add address"}</h2>
                        <label>
                            Label
                            <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
                        </label>
                        <label>
                            Recipient
                            <input value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} />
                        </label>
                        <label>
                            Phone
                            <input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} />
                        </label>
                        <label>
                            Address
                            <input value={form.addressLine} onChange={(event) => setForm((current) => ({ ...current, addressLine: event.target.value }))} />
                        </label>
                        <div className="address-book__form__grid">
                            <label>
                                City
                                <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
                            </label>
                            <label>
                                Country
                                <input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
                            </label>
                        </div>
                        <label className="address-book__check">
                            <input
                                type="checkbox"
                                checked={form.isDefault}
                                onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                            />
                            Use as default shipping address
                        </label>
                        <div className="address-book__actions">
                            <button type="button" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving ? "Saving..." : form.id ? "Save address" : "Add address"}
                            </button>
                            <button type="button" className="secondary" onClick={() => setForm(emptyForm)}>
                                Reset
                            </button>
                        </div>
                    </div>

                    <div className="address-book__list">
                        {addresses.length > 0 ? (
                            addresses.map((address) => (
                                <article key={address.id} className={address.is_default ? "is-default" : ""}>
                                    <div>
                                        <strong>{address.label}</strong>
                                        {address.is_default ? <span>Default</span> : null}
                                    </div>
                                    <p>{address.address_line}</p>
                                    <small>{[address.city, address.country].filter(Boolean).join(", ") || "Location not specified"}</small>
                                    <small>{[address.recipient_name, address.phone_number].filter(Boolean).join(" | ") || "No recipient details"}</small>
                                    <div className="address-book__list__actions">
                                        <button type="button" onClick={() => handleEdit(address)}>Edit</button>
                                        <button type="button" className="danger" onClick={() => handleDelete(address.id)}>Delete</button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="address-book__empty">No saved addresses yet.</div>
                        )}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default AddressBookPage;
