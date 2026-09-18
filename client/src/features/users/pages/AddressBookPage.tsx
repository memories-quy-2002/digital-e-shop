import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../../../context/AuthContext";
import { useT } from "../../../hooks/useT";
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

const createEmptyForm = (homeLabel: string): AddressForm => ({
    label: homeLabel,
    recipientName: "",
    phoneNumber: "",
    addressLine: "",
    city: "",
    country: "",
    isDefault: false,
});
const AddressBookPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [form, setForm] = useState<AddressForm>(() => createEmptyForm(t("addresses.home")));
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDeleteAddress, setPendingDeleteAddress] = useState<CustomerAddress | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadAddresses = async () => {
        if (!uid) return;
        try {
            setAddresses(await fetchCustomerAddresses(uid));
        } catch {
            addToast(t("addresses.toastTitle"), t("addresses.loadError"));
        }
    };

    useEffect(() => {
        loadAddresses();
    }, [uid]);

    const handleEdit = (address: CustomerAddress) => {
        setForm({
            id: address.id,
            label: address.label || t("addresses.shippingAddress"),
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
            addToast(t("addresses.toastTitle"), t("addresses.required"));
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
                addToast(t("addresses.toastTitle"), t("addresses.updated"));
            } else {
                await createCustomerAddress(uid, payload);
                addToast(t("addresses.toastTitle"), t("addresses.saved"));
            }
            setForm(createEmptyForm(t("addresses.home")));
            loadAddresses();
        } catch (err: unknown) {
            const maybeMessage =
                typeof err === "object" &&
                err !== null &&
                "response" in err &&
                typeof (err as { response?: { data?: { msg?: string } } }).response?.data?.msg === "string"
                    ? (err as { response?: { data?: { msg?: string } } }).response?.data?.msg
                    : undefined;
            const message = maybeMessage ?? t("addresses.saveError");
            addToast(t("addresses.toastTitle"), message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!uid || !pendingDeleteAddress) return;
        try {
            setIsDeleting(true);
            await deleteCustomerAddress(uid, pendingDeleteAddress.id);
            addToast(t("addresses.toastTitle"), t("addresses.removed"));
            setPendingDeleteAddress(null);
            loadAddresses();
        } catch {
            addToast(t("addresses.toastTitle"), t("addresses.removeError"));
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
                <title>{t("addresses.metaTitle")}</title>
                <meta name="description" content={t("addresses.metaDescription")} />
            </Helmet>
            <main className="address-book">
                <CustomerAccountShell
                    eyebrow={t("addresses.eyebrow")}
                    title={t("addresses.title")}
                    description={t("addresses.description")}
                />

                <section className="address-book__summary" aria-label={t("addresses.summaryAria")}>
                    <article>
                        <span>{t("addresses.savedAddresses")}</span>
                        <strong>{addresses.length}</strong>
                    </article>
                    <article>
                        <span>{t("addresses.defaultAddress")}</span>
                        <strong>{addresses.some((address) => address.is_default) ? t("addresses.configured") : t("addresses.notSet")}</strong>
                    </article>
                    <article>
                        <span>{t("addresses.checkoutReady")}</span>
                        <strong>{addresses.length > 0 ? t("addresses.yes") : t("addresses.addOne")}</strong>
                    </article>
                </section>

                <section className="address-book__layout">
                    <div className="address-book__form">
                        <div className="address-book__form-header">
                            <div>
                                <span>{form.id ? t("addresses.editingAddress") : t("addresses.newAddress")}</span>
                                <h2>{form.id ? form.label || t("addresses.savedAddress") : t("addresses.addAddress")}</h2>
                                <p>{t("addresses.formDescription")}</p>
                            </div>
                            {form.id ? (
                                <button type="button" onClick={() => setForm(createEmptyForm(t("addresses.home")))}>
                                    {t("addresses.cancelEdit")}
                                </button>
                            ) : null}
                        </div>
                        <div className="address-book__form-section">
                            <h3>{t("addresses.recipientSection")}</h3>
                        <label>
                            {t("addresses.label")}
                            <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
                        </label>
                        <label>
                            {t("addresses.recipient")}
                            <input value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} />
                        </label>
                        <label>
                            {t("addresses.phone")}
                            <input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} />
                        </label>
                        </div>
                        <div className="address-book__form-section">
                            <h3>{t("addresses.deliveryLocation")}</h3>
                        <label>
                            {t("addresses.address")}
                            <input value={form.addressLine} onChange={(event) => setForm((current) => ({ ...current, addressLine: event.target.value }))} />
                        </label>
                        <div className="address-book__form__grid">
                            <label>
                                {t("addresses.city")}
                                <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
                            </label>
                            <label>
                                {t("addresses.country")}
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
                            {t("addresses.useDefault")}
                        </label>
                        <div className="address-book__actions">
                            <button type="button" onClick={handleSubmit} disabled={isSaving}>
                                {isSaving ? t("addresses.saving") : form.id ? t("addresses.saveAddress") : t("addresses.addAddress")}
                            </button>
                            <button type="button" className="secondary" onClick={() => setForm(createEmptyForm(t("addresses.home")))}>
                                {t("addresses.reset")}
                            </button>
                        </div>
                    </div>

                    <div className="address-book__list">
                        {addresses.length > 0 ? (
                            addresses.map((address) => (
                                <article key={address.id} className={address.is_default ? "is-default" : ""}>
                                    <div>
                                        <strong>{address.label}</strong>
                                        {address.is_default ? <span>{t("addresses.default")}</span> : null}
                                    </div>
                                    <p>{address.address_line}</p>
                                    <small>{[address.city, address.country].filter(Boolean).join(", ") || t("addresses.locationNotSpecified")}</small>
                                    <small>
                                        {[address.recipient_name, address.phone_number].filter(Boolean).join(" | ") ||
                                            t("addresses.noRecipientDetails")}
                                    </small>
                                    <div className="address-book__list__actions">
                                        <button type="button" onClick={() => handleEdit(address)}>
                                            {t("addresses.edit")}
                                        </button>
                                        <button type="button" className="danger" onClick={() => handleRequestDelete(address.id)}>
                                            {t("addresses.delete")}
                                        </button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <EmptyState
                                className="address-book__empty"
                                title={t("addresses.noSavedAddresses")}
                                description={t("addresses.emptyDescription")}
                                icon={<HouseIcon size={20} />}
                                compact
                            />
                        )}
                    </div>
                </section>
                <ConfirmActionModal
                    show={pendingDeleteAddress !== null}
                    title={t("addresses.deleteAddress")}
                    message={t("addresses.deleteMessage", pendingDeleteAddress?.label || t("addresses.shippingAddress"))}
                    confirmLabel={t("addresses.delete")}
                    isConfirming={isDeleting}
                    onCancel={() => setPendingDeleteAddress(null)}
                    onConfirm={handleDelete}
                />
            </main>
        </Layout>
    );
};

export default AddressBookPage;
