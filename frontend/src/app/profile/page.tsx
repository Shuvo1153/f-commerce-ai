"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = "/api/v1";

type Session = {
  accessToken: string;
  user: { id: string; name: string; email: string };
};

type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  defaultAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
  } | null;
};

type AddressForm = {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
};

type SellerProfile = {
  id: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  verificationStatus: string;
};

type PurchaseOrder = {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: string;
  createdAt: string;
  payments: { paymentMethod: string; paymentStatus: string }[];
  sellerOrders: {
    id: string;
    status: string;
    subtotal: string;
    seller: { businessName: string };
    items: { productNameSnapshot: string; quantity: number; unitPrice: string; subtotal: string }[];
  }[];
};

type BusinessForm = {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
};

const emptyAddress: AddressForm = {
  fullName: "",
  phone: "",
  addressLine: "",
  city: "",
  postalCode: "",
  country: "Bangladesh",
};

function formatPrice(value: string | number) {
  return `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
}

async function errorMessage(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    if (response.status >= 500) {
      return "The service is temporarily unavailable. Please wait a moment, then refresh the page.";
    }
    return "The server returned an unexpected response. Please refresh the page and try again.";
  }

  const data = await response.json() as { message?: string | string[] };
  return Array.isArray(data.message) ? data.message.join(" ") : data.message || "Something went wrong. Please try again.";
}

export default function ProfilePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [addressMessage, setAddressMessage] = useState("");
  const [error, setError] = useState("");
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [sellerLoading, setSellerLoading] = useState(true);
  const [businessSetupOpen, setBusinessSetupOpen] = useState(false);
  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
  });
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessMessage, setBusinessMessage] = useState("");
  const [sellerError, setSellerError] = useState("");
  const [purchaseViewOpen, setPurchaseViewOpen] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const previousPurchases = useRef<PurchaseOrder[]>([]);

  const refreshPurchases = useCallback(async (detectConfirmations: boolean) => {
    if (!session) return;
    try {
      const response = await fetch(`${apiUrl}/orders/mine`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json() as { orders: PurchaseOrder[] };
      if (detectConfirmations) {
        const newlyConfirmed = result.orders.find((order) => order.sellerOrders.some((sellerOrder) => {
          const previousOrder = previousPurchases.current.find((item) => item.id === order.id);
          const previousSellerOrder = previousOrder?.sellerOrders.find((item) => item.id === sellerOrder.id);
          return previousSellerOrder?.status === "PENDING" && sellerOrder.status === "CONFIRMED";
        }));
        if (newlyConfirmed) {
          setConfirmationMessage(`The seller confirmed order ${newlyConfirmed.orderNumber}. Your items are being prepared.`);
        }
      }
      previousPurchases.current = result.orders;
      setPurchases(result.orders);
      setPurchaseError("");
    } catch (requestError) {
      setPurchaseError(requestError instanceof Error ? requestError.message : "Could not load your purchase history.");
    } finally {
      setPurchaseLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!purchaseViewOpen || !session) return;
    const interval = window.setInterval(() => { void refreshPurchases(true); }, 15000);
    return () => window.clearInterval(interval);
  }, [purchaseViewOpen, refreshPurchases, session]);

  useEffect(() => {
    const stored = localStorage.getItem("fcommerce.session");
    if (!stored) {
      router.replace("/login");
      return;
    }

    let currentSession: Session;
    try {
      currentSession = JSON.parse(stored) as Session;
      if (!currentSession.accessToken || !currentSession.user?.id) throw new Error("Invalid session.");
      setSession(currentSession);
    } catch {
      localStorage.removeItem("fcommerce.session");
      router.replace("/login");
      return;
    }

    fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${currentSession.accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        return response.json() as Promise<Profile>;
      })
      .then((data) => {
        setProfile(data);
        setName(data.name);
        setPhone(data.phone || "");
        setAddress(data.defaultAddress ? { ...data.defaultAddress } : { ...emptyAddress, fullName: data.name, phone: data.phone || "" });
        setBusinessForm((current) => ({
          ...current,
          businessEmail: current.businessEmail || data.email,
          businessPhone: current.businessPhone || data.phone || "",
        }));
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
        if (requestError.message.includes("session") || requestError.message.includes("sign in")) {
          localStorage.removeItem("fcommerce.session");
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));

    fetch(`${apiUrl}/seller/me`, {
      headers: { Authorization: `Bearer ${currentSession.accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        return response.json() as Promise<{ sellerProfile: SellerProfile | null }>;
      })
      .then((data) => {
        setSellerProfile(data.sellerProfile);
        setBusinessForm({
          businessName: data.sellerProfile?.businessName || "",
          businessEmail: data.sellerProfile?.businessEmail || currentSession.user.email,
          businessPhone: data.sellerProfile?.businessPhone || "",
        });
      })
      .catch((requestError: Error) => setSellerError(requestError.message))
      .finally(() => setSellerLoading(false));
  }, [router]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setProfileSaving(true);
    setProfileMessage("");
    setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ name, phone }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const updated = await response.json() as Pick<Profile, "id" | "name" | "email" | "phone">;
      const nextSession = { ...session, user: { ...session.user, name: updated.name, email: updated.email } };
      localStorage.setItem("fcommerce.session", JSON.stringify(nextSession));
      setSession(nextSession);
      setProfile((current) => current ? { ...current, ...updated } : current);
      setProfileMessage("Your profile details have been saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveAddress(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setAddressSaving(true);
    setAddressMessage("");
    setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/me/address`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify(address),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const saved = await response.json() as AddressForm;
      setAddress(saved);
      setProfile((current) => current ? { ...current, defaultAddress: saved } : current);
      setAddressMessage("Your delivery address has been saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your delivery address.");
    } finally {
      setAddressSaving(false);
    }
  }

  async function createBusinessProfile(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setBusinessSaving(true);
    setBusinessMessage("");
    setSellerError("");
    try {
      const response = await fetch(`${apiUrl}/seller/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify(businessForm),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await response.json() as SellerProfile;
      router.push("/business");
    } catch (requestError) {
      setSellerError(requestError instanceof Error ? requestError.message : "Could not create your business profile.");
    } finally {
      setBusinessSaving(false);
    }
  }

  function openPurchaseHistory() {
    setBusinessSetupOpen(false);
    setPurchaseViewOpen(true);
    setPurchaseError("");
    setConfirmationMessage("");
    setPurchaseLoading(true);
    previousPurchases.current = [];
    void refreshPurchases(false);
  }

  function signOut() {
    localStorage.removeItem("fcommerce.session");
    router.replace("/login");
  }

  if (loading || sellerLoading) return <main className="page-loading"><span className="spinner" />Loading your profile…</main>;
  if (!session || !profile) {
    return <main className="page-loading">{error || "Your profile could not be loaded."} <a href="/login">Sign in</a></main>;
  }

  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <main>
      <div className="utility-bar"><div className="shop-container utility-content"><span>Your F-Commerce account</span><span>Need help? <a href="mailto:support@fcommerce.local">Contact us</a></span></div></div>
      <header className="shop-header">
        <div className="shop-container profile-header">
          <a className="profile-back" href="/" aria-label="Back to shop"><span aria-hidden="true">←</span> Continue shopping</a>
          <a className="shop-brand profile-header-brand" href="/" aria-label="F-Commerce home"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></a>
          <a className="header-avatar" href="/profile" aria-label="My profile" title="My profile">{initials || "F"}</a>
        </div>
      </header>

      <div className="shop-container profile-page">
        <div className="profile-page-heading">
          <div><span className="section-kicker">YOUR ACCOUNT</span><h1>My profile</h1><p>Manage your personal information and delivery details.</p></div>
          <div className="profile-member">Member since <strong>{new Date(profile.createdAt).toLocaleDateString("en-BD", { month: "long", year: "numeric" })}</strong></div>
        </div>

        <div className="profile-layout">
          <aside className="profile-summary">
            <div className="profile-avatar">{initials || "F"}</div>
            <h2>{profile.name}</h2>
            <p>{profile.email}</p>
            <span className="profile-status"><i /> Customer account</span>
            <div className="profile-summary-line" />
            <div className="profile-summary-note"><span>◇</span><div><strong>Your information, your way</strong><small>Keep your details up to date for a smoother checkout.</small></div></div>
            <button className="business-dashboard-link" type="button" onClick={openPurchaseHistory}><span aria-hidden="true">▤</span> Purchase history</button>
            {sellerProfile ? (
              <a className="business-dashboard-link" href="/business"><span aria-hidden="true">▦</span> Business dashboard</a>
            ) : sellerError ? (
              <div className="profile-alert" role="alert">{sellerError}</div>
            ) : (
              <button className="business-dashboard-link" type="button" onClick={() => { setPurchaseViewOpen(false); setSellerError(""); setBusinessSetupOpen(true); }}>
                <span aria-hidden="true">＋</span> Create a business profile
              </button>
            )}
            <button className="profile-signout" onClick={signOut}><span aria-hidden="true">↪</span> Sign out</button>
          </aside>

          <div className="profile-content">
            {error && <div className="profile-alert" role="alert">{error}</div>}
            {sellerError && businessSetupOpen && <div className="profile-alert" role="alert">{sellerError}</div>}
            {businessSetupOpen && !sellerProfile ? (
              <section className="profile-card">
                <button className="checkout-back" type="button" onClick={() => { setBusinessSetupOpen(false); setSellerError(""); }}>← Back to personal profile</button>
                <div className="profile-card-heading"><div><h2>Create a business profile</h2><p>Set up your seller account to access a separate business dashboard and list products.</p></div><span className="profile-card-icon">SELLER</span></div>
                <form className="profile-form" onSubmit={createBusinessProfile}>
                  <label className="profile-field-wide">Business name<input value={businessForm.businessName} onChange={(event) => setBusinessForm({ ...businessForm, businessName: event.target.value })} required maxLength={120} /></label>
                  <label>Business email<input type="email" value={businessForm.businessEmail} onChange={(event) => setBusinessForm({ ...businessForm, businessEmail: event.target.value })} required maxLength={254} /></label>
                  <label>Business phone<input type="tel" value={businessForm.businessPhone} onChange={(event) => setBusinessForm({ ...businessForm, businessPhone: event.target.value })} required maxLength={30} /></label>
                  <div className="profile-form-footer">{businessMessage && <span className="profile-success">{businessMessage}</span>}<button className="profile-save" disabled={businessSaving}>{businessSaving ? "Setting up…" : "Create business profile"}</button></div>
                </form>
              </section>
            ) : purchaseViewOpen ? (
              <section className="profile-card">
                <button className="checkout-back" type="button" onClick={() => setPurchaseViewOpen(false)}>← Back to profile</button>
                <div className="profile-card-heading"><div><h2>Purchase history</h2><p>Your orders and seller confirmation updates.</p></div><span className="profile-card-icon">{purchases.length} ORDERS</span></div>
                {confirmationMessage && <div className="purchase-confirmation" role="status"><span>✓</span>{confirmationMessage}</div>}
                {purchaseError && <div className="profile-alert" role="alert">{purchaseError}</div>}
                {purchaseLoading ? (
                  <div className="catalog-state"><span className="spinner" />Loading your purchases…</div>
                ) : purchases.length === 0 ? (
                  <p className="purchase-empty">You haven’t placed any orders yet.</p>
                ) : (
                  <div className="purchase-list">
                    {purchases.map((order) => (
                      <article className="purchase-order" key={order.id}>
                        <div className="purchase-order-heading">
                          <div><strong>{order.orderNumber}</strong><small>Placed {formatDate(order.createdAt)}</small></div>
                          <span className={`business-order-status status-${order.orderStatus.toLowerCase()}`}>{order.orderStatus}</span>
                        </div>
                        {order.sellerOrders.map((sellerOrder) => (
                          <div className="purchase-seller-order" key={sellerOrder.id}>
                            <div className="purchase-seller-heading"><strong>{sellerOrder.seller.businessName}</strong><span className={`business-order-status status-${sellerOrder.status.toLowerCase()}`}>{sellerOrder.status}</span></div>
                            <ul>{sellerOrder.items.map((item, index) => <li key={`${sellerOrder.id}-${index}`}>{item.productNameSnapshot} × {item.quantity}<span>{formatPrice(item.subtotal)}</span></li>)}</ul>
                            {sellerOrder.status === "CONFIRMED" && <div className="purchase-seller-confirmed">✓ Seller confirmed your order. Your items are being prepared for delivery.</div>}
                            {sellerOrder.status === "PENDING" && <p className="purchase-seller-pending">Waiting for the seller to confirm this order.</p>}
                          </div>
                        ))}
                        <div className="purchase-order-total">
                          <span>{order.payments[0]?.paymentMethod === "SSLCOMMERZ"
                            ? `SSLCommerz · ${order.paymentStatus}`
                            : `Cash on delivery · ${order.paymentStatus}`}</span>
                          <strong>Total {formatPrice(order.totalAmount)}</strong>
                        </div>
                      </article>
                    ))}
                    <p className="purchase-refresh-note">Order updates refresh automatically while this page is open.</p>
                  </div>
                )}
              </section>
            ) : (
              <>
            <section className="profile-card">
              <div className="profile-card-heading"><div><h2>Personal information</h2><p>Your name and contact details.</p></div><span className="profile-card-icon">01</span></div>
              <form className="profile-form" onSubmit={saveProfile}>
                <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" /></label>
                <label>Email address<input value={profile.email} readOnly aria-readonly="true" /><small>Email can’t be changed here.</small></label>
                <label className="profile-field-wide">Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+880 1XXX-XXXXXX" autoComplete="tel" /></label>
                <div className="profile-form-footer">{profileMessage && <span className="profile-success">{profileMessage}</span>}<button className="profile-save" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save changes"}</button></div>
              </form>
            </section>

            <section className="profile-card">
              <div className="profile-card-heading"><div><h2>Default delivery address</h2><p>We’ll use this address when you place an order.</p></div><span className="profile-card-icon">02</span></div>
              <form className="profile-form" onSubmit={saveAddress}>
                <label>Recipient name<input value={address.fullName} onChange={(event) => setAddress({ ...address, fullName: event.target.value })} required autoComplete="shipping name" /></label>
                <label>Delivery phone<input type="tel" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} required autoComplete="shipping tel" /></label>
                <label className="profile-field-wide">Street address<input value={address.addressLine} onChange={(event) => setAddress({ ...address, addressLine: event.target.value })} required placeholder="House, road, area" autoComplete="street-address" /></label>
                <label>City<input value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} required autoComplete="address-level2" /></label>
                <label>Postal code<input value={address.postalCode} onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} required autoComplete="postal-code" /></label>
                <label className="profile-field-wide">Country<input value={address.country} onChange={(event) => setAddress({ ...address, country: event.target.value })} required autoComplete="country-name" /></label>
                <div className="profile-form-footer">{addressMessage && <span className="profile-success">{addressMessage}</span>}<button className="profile-save" disabled={addressSaving}>{addressSaving ? "Saving…" : "Save address"}</button></div>
              </form>
            </section>
              </>
            )}
          </div>
        </div>
        <footer className="shop-footer"><a className="shop-brand footer-brand" href="/"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></a><span>Shopping made a little more delightful.</span><span>© 2026 F-Commerce</span></footer>
      </div>
    </main>
  );
}
