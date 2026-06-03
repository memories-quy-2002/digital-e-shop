import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { HouseIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import Layout from "../../../components/layout/Layout";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import "../../../styles/features/users/_address-book.scss";
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
    const [pendingDeleteAddress, setPendingDeleteAddress] = useState<CustomerAddress | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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

    const handleDelete = async () => {
        if (!uid || !pendingDeleteAddress) return;
        try {
            setIsDeleting(true);
            await deleteCustomerAddress(uid, pendingDeleteAddress.id);
            addToast("Address book", "Address removed.");
            setPendingDeleteAddress(null);
            loadAddresses();
        } catch {
            addToast("Address book", "Unable to remove address.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRequestDelete = (addressId: number) => {
        const address = addresses.find((item) => item.id === addressId) || null;
        setPendingDeleteAddress(address);
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

                <section className="address-book__summary" aria-label="Address book summary">
                    <article>
                        <span>Saved addresses</span>
                        <strong>{addresses.length}</strong>
                    </article>
                    <article>
                        <span>Default address</span>
                        <strong>{addresses.some((address) => address.is_default) ? "Configured" : "Not set"}</strong>
                    </article>
                    <article>
                        <span>Checkout ready</span>
                        <strong>{addresses.length > 0 ? "Yes" : "Add one"}</strong>
                    </article>
                </section>

                <section className="address-book__layout">
                    <div className="address-book__form">
                        <div className="address-book__form-header">
                            <div>
                                <span>{form.id ? "Editing address" : "New address"}</span>
                                <h2>{form.id ? form.label || "Saved address" : "Add address"}</h2>
                                <p>Keep recipient details and delivery locations ready for future checkout.</p>
                            </div>
                            {form.id ? (
                                <button type="button" onClick={() => setForm(emptyForm)}>
                                    Cancel edit
                                </button>
                            ) : null}
                        </div>
                        <div className="address-book__form-section">
                            <h3>Recipient</h3>
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
                        </div>
                        <div className="address-book__form-section">
                            <h3>Delivery location</h3>
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
                                        <button type="button" className="danger" onClick={() => handleRequestDelete(address.id)}>
                                            Delete
                                        </button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <EmptyState
                                className="address-book__empty"
                                title="No saved addresses yet"
                                description="Add your first delivery location to make checkout faster and keep shipping details consistent."
                                icon={<HouseIcon size={20} />}
                                compact
                            />
                        )}
                    </div>
                </section>
                <ConfirmActionModal
                    show={pendingDeleteAddress !== null}
                    title="Delete address"
                    message={`Delete "${pendingDeleteAddress?.label || "this address"}" from your address book?`}
                    confirmLabel="Delete"
                    isConfirming={isDeleting}
                    onCancel={() => setPendingDeleteAddress(null)}
                    onConfirm={handleDelete}
                />
            </main>
        </Layout>
    );
};

export default AddressBookPage;
