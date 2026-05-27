import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import Layout from "../../../components/layout/Layout";
import "../../../styles/AddressBookPage.scss";
import CustomerAccountShell from "../components/CustomerAccountShell";
import {
    CustomerAddress,
    CustomerAddressPayload,
    createCustomerAddress,
    deleteCustomerAddress,
    fetchCustomerAddresses,
    updateCustomerAddress,
} from "../api";

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
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [form, setForm] = useState<AddressForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadAddresses = async () => {
        if (!uid) return;
        try {
            setAddresses(await fetchCustomerAddresses(uid));
        } catch {
            addToast("Address book", "Unable to load saved addresses.");
        }
    };

    useEffect(() => {
        loadAddresses();
    }, [uid]);

    const handleEdit = (address: CustomerAddress) => {
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
            const payload: CustomerAddressPayload = {
                label: form.label,
                recipientName: form.recipientName,
                phoneNumber: form.phoneNumber,
                addressLine: form.addressLine,
                city: form.city,
                country: form.country,
                isDefault: form.isDefault,
            };
            if (form.id) {
                await updateCustomerAddress(uid, form.id, payload);
                addToast("Address book", "Address updated.");
            } else {
                await createCustomerAddress(uid, payload);
                addToast("Address book", "Address saved.");
            }
            setForm(emptyForm);
            loadAddresses();
        } catch (err: unknown) {
            const maybeMessage =
                typeof err === "object" &&
                err !== null &&
                "response" in err &&
                typeof (err as { response?: { data?: { msg?: string } } }).response?.data?.msg === "string"
                    ? (err as { response?: { data?: { msg?: string } } }).response?.data?.msg
                    : undefined;
            const message = maybeMessage ?? "Unable to save address.";
            addToast("Address book", message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (addressId: number) => {
        if (!uid) return;
        try {
            await deleteCustomerAddress(uid, addressId);
            addToast("Address book", "Address removed.");
            loadAddresses();
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
                <CustomerAccountShell
                    eyebrow="Account"
                    title="Address book"
                    description="Save delivery addresses and select a default address for faster checkout."
                />

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
                                    <small>
                                        {[address.recipient_name, address.phone_number].filter(Boolean).join(" | ") ||
                                            "No recipient details"}
                                    </small>
                                    <div className="address-book__list__actions">
                                        <button type="button" onClick={() => handleEdit(address)}>
                                            Edit
                                        </button>
                                        <button type="button" className="danger" onClick={() => handleDelete(address.id)}>
                                            Delete
                                        </button>
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
