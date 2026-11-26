"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = "/api/v1";
type View = "overview" | "products" | "orders";

type Session = {
  accessToken: string;
  user: { id: string; name: string; email: string };
};

type Category = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  brand: string;
  description: string;
  price: string;
  discountPrice: string | null;
  stockQuantity: number;
  status: string;
  category: { name: string };
  images: { imageUrl: string; isPrimary: boolean }[];
};
type BusinessOrder = {
  id: string;
  status: string;
  subtotal: string;
  createdAt: string;
  order: {
    orderNumber: string;
    paymentStatus: string;
    payments: { paymentMethod: string }[];
    shippingAddressSnapshot: {
      fullName: string;
      phone: string;
      addressLine: string;
      city: string;
      postalCode: string;
      country: string;
    };
  };
  items: { productNameSnapshot: string; quantity: number; unitPrice: string; subtotal: string }[];
};
type Dashboard = {
  seller: { businessName: string; businessEmail: string; businessPhone: string; verificationStatus: string };
  products: Product[];
  categories: Category[];
  orders: BusinessOrder[];
  metrics: {
    totalSales: string;
    totalOrders: number;
    pendingOrders: number;
    activeProducts: number;
    currentMonthSales: string;
    growthPercent: number | null;
    monthlySales: { month: string; total: string }[];
  };
};
type ProductForm = {
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  price: string;
  discountPrice: string;
  stockQuantity: string;
};

const emptyProduct: ProductForm = {
  name: "",
  brand: "",
  description: "",
  categoryId: "",
  price: "",
  discountPrice: "",
  stockQuantity: "0",
};

function formatPrice(value: string | number) {
  return `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" });
}

async function errorMessage(response: Response) {
  const data = await response.json() as { message?: string | string[] };
  return Array.isArray(data.message) ? data.message.join(" ") : data.message || "Something went wrong. Please try again.";
}

async function fetchDashboard(accessToken: string): Promise<Dashboard> {
  const response = await fetch(`${apiUrl}/seller/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<Dashboard>;
}

export default function BusinessDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState("");
  const [updatingProductId, setUpdatingProductId] = useState("");
  const [productMessage, setProductMessage] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState("");

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

    fetchDashboard(currentSession.accessToken)
      .then(setDashboard)
      .catch((requestError: Error) => {
        if (requestError.message.includes("business profile")) {
          router.replace("/profile");
          return;
        }
        setError(requestError.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!productImage) {
      setProductImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(productImage);
    setProductImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [productImage]);

  async function reloadDashboard() {
    if (!session) return;
    setDashboard(await fetchDashboard(session.accessToken));
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setSavingProduct(true);
    setProductMessage("");
    setError("");
    try {
      const formData = new FormData();
      Object.entries(productForm).forEach(([key, value]) => formData.append(key, value));
      if (productImage) formData.append("image", productImage);
      const response = await fetch(`${apiUrl}/seller/products`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        body: formData,
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await reloadDashboard();
      const stockQuantity = Number(productForm.stockQuantity);
      setProductForm(emptyProduct);
      setProductImage(null);
      setProductMessage(stockQuantity > 0
        ? `Product published with ${stockQuantity} units available.`
        : "Product published as out of stock. Customers can see it but cannot order it.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not publish the product.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function confirmOrder(orderId: string) {
    if (!session) return;
    setConfirmingOrderId(orderId);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/seller/orders/${orderId}/confirm`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await reloadDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not confirm the order.");
    } finally {
      setConfirmingOrderId("");
    }
  }

  async function updateProductAvailability(productId: string, inStock: boolean) {
    if (!session) return;
    setUpdatingProductId(productId);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/seller/products/${productId}/availability`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inStock }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await reloadDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update product availability.");
    } finally {
      setUpdatingProductId("");
    }
  }

  async function updateProductStock(productId: string, stockQuantity: number) {
    if (!session) return;
    setUpdatingProductId(productId);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/seller/products/${productId}/stock`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stockQuantity }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await reloadDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update product stock.");
    } finally {
      setUpdatingProductId("");
    }
  }

  function signOut() {
    localStorage.removeItem("fcommerce.session");
    router.replace("/login");
  }

  if (loading || !dashboard) {
    return <main className="page-loading">{error ? error : <><span className="spinner" />Loading your business dashboard…</>}</main>;
  }

  const maxMonthlySales = Math.max(...dashboard.metrics.monthlySales.map((item) => Number(item.total)), 1);
  const growth = dashboard.metrics.growthPercent;

  return (
    <main className="business-page">
      <aside className="business-sidebar">
        <a className="shop-brand business-brand" href="/"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></a>
        <div className="business-sidebar-label">SELLER WORKSPACE</div>
        <div className="business-sidebar-name">{dashboard.seller.businessName}</div>
        <nav className="business-nav" aria-label="Business dashboard">
          <button className={view === "overview" ? "business-nav-active" : ""} onClick={() => setView("overview")}><span>⌂</span> Overview</button>
          <button className={view === "products" ? "business-nav-active" : ""} onClick={() => setView("products")}><span>▦</span> Products <i>{dashboard.products.length}</i></button>
          <button className={view === "orders" ? "business-nav-active" : ""} onClick={() => setView("orders")}><span>▤</span> Orders {dashboard.metrics.pendingOrders > 0 && <i>{dashboard.metrics.pendingOrders}</i>}</button>
        </nav>
        <div className="business-sidebar-footer">
          <a href="/">← View storefront</a>
          <a href="/profile">Personal profile</a>
          <button onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <section className="business-main">
        <header className="business-topbar">
          <span>Business dashboard</span>
          <div className="business-topbar-actions"><a href="/profile">Personal profile</a><a href="/">Visit store <span aria-hidden="true">↗</span></a></div>
        </header>
        <div className="business-content">
          <div className="business-heading">
            <div><span className="section-kicker">SELLER OVERVIEW</span><h1>{view === "overview" ? "Good business starts here." : view === "products" ? "Your products" : "Order management"}</h1><p>{dashboard.seller.businessName} · Your sales and store activity in one place.</p></div>
            <span className="seller-live-status"><i /> Store active</span>
          </div>
          {error && <div className="profile-alert" role="alert">{error}</div>}

          {view === "overview" && (
            <>
              <div className="business-metrics">
                <article className="business-metric"><span>Total sales</span><strong>{formatPrice(dashboard.metrics.totalSales)}</strong><small>From {dashboard.metrics.totalOrders} orders</small></article>
                <article className="business-metric"><span>This month</span><strong>{formatPrice(dashboard.metrics.currentMonthSales)}</strong><small>Current month sales</small></article>
                <article className="business-metric"><span>Monthly growth</span><strong className={growth !== null && growth < 0 ? "growth-negative" : "growth-positive"}>{growth === null ? "New sales" : `${growth > 0 ? "+" : ""}${growth}%`}</strong><small>Compared with last month</small></article>
                <article className="business-metric"><span>To confirm</span><strong>{dashboard.metrics.pendingOrders}</strong><small>Customer orders waiting</small></article>
              </div>

              <section className="business-panel">
                <div className="business-panel-heading"><div><h2>Monthly sales</h2><p>Non-cancelled order totals; pending cash-on-delivery orders are included.</p></div><span>{dashboard.metrics.activeProducts} active products</span></div>
                <div className="sales-chart" role="img" aria-label="Monthly sales for the last six months">
                  {dashboard.metrics.monthlySales.map((month) => {
                    const amount = Number(month.total);
                    return (
                      <div className="sales-chart-column" key={month.month}>
                        <strong>{formatPrice(amount)}</strong>
                        <div className="sales-chart-track"><span style={{ height: `${amount > 0 ? Math.max((amount / maxMonthlySales) * 100, 5) : 0}%` }} /></div>
                        <small>{month.month}</small>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="business-panel">
                <div className="business-panel-heading"><div><h2>Orders to confirm</h2><p>Confirm orders you’re ready to fulfill.</p></div><button className="business-text-button" onClick={() => setView("orders")}>View all orders →</button></div>
                <OrderList orders={dashboard.orders.filter((order) => order.status === "PENDING").slice(0, 4)} confirmingOrderId={confirmingOrderId} onConfirm={confirmOrder} />
              </section>
            </>
          )}

          {view === "products" && (
            <div className="business-product-layout">
              <section className="business-panel business-product-form-panel">
                <div className="business-panel-heading"><div><h2>Add a product</h2><p>New products go live as soon as they’re published.</p></div></div>
                <form className="business-product-form" onSubmit={createProduct}>
                  <label>Product name<input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required maxLength={160} /></label>
                  <label>Brand<input value={productForm.brand} onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })} required maxLength={100} /></label>
                  <label className="business-field-wide">Description<textarea value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} required maxLength={2000} rows={3} /></label>
                  <label>Category<select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })} required><option value="">Choose category</option>{dashboard.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                  <label>Price (৳)<input type="number" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} required min="0.01" step="0.01" /></label>
                  <label>Discount price (৳)<input type="number" value={productForm.discountPrice} onChange={(event) => setProductForm({ ...productForm, discountPrice: event.target.value })} min="0.01" step="0.01" /></label>
                  <label>Available quantity<input type="number" value={productForm.stockQuantity} onChange={(event) => setProductForm({ ...productForm, stockQuantity: event.target.value })} required min="0" max="2147483647" step="1" /></label>
                  <label className="business-field-wide">Product image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                    const selected = event.target.files?.[0] || null;
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      setError("Product images must be 5 MB or smaller.");
                      event.target.value = "";
                      return;
                    }
                    setError("");
                    setProductImage(selected);
                  }} /><small>JPEG, PNG, or WebP · maximum 5 MB</small></label>
                  {productImagePreview && <div className="business-image-preview business-field-wide"><img src={productImagePreview} alt="Selected product preview" /><span>{productImage?.name}</span><button type="button" onClick={() => setProductImage(null)}>Remove image</button></div>}
                  {productMessage && <p className="profile-success business-product-message">{productMessage}</p>}
                  <button className="profile-save business-field-wide" disabled={savingProduct}>{savingProduct ? "Publishing…" : "Publish product"}</button>
                </form>
              </section>
              <section className="business-panel">
                <div className="business-panel-heading"><div><h2>Published products</h2><p>{dashboard.products.length} total listings</p></div></div>
                <ProductList
                  products={dashboard.products}
                  updatingProductId={updatingProductId}
                  onUpdateAvailability={updateProductAvailability}
                  onUpdateStock={updateProductStock}
                />
              </section>
            </div>
          )}

          {view === "orders" && (
            <section className="business-panel">
              <div className="business-panel-heading"><div><h2>Customer orders</h2><p>Review delivery details and confirm orders for fulfillment.</p></div></div>
              <OrderList orders={dashboard.orders} confirmingOrderId={confirmingOrderId} onConfirm={confirmOrder} />
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

function OrderList({
  orders,
  confirmingOrderId,
  onConfirm,
}: {
  orders: BusinessOrder[];
  confirmingOrderId: string;
  onConfirm: (id: string) => void;
}) {
  if (orders.length === 0) return <p className="business-empty">No orders here yet.</p>;
  return (
    <ul className="business-order-list">
      {orders.map((order) => (
        <li key={order.id}>
          <div className="business-order-heading">
            <div><strong>{order.order.orderNumber}</strong><small>{formatDate(order.createdAt)} · {order.order.payments[0]?.paymentMethod === "SSLCOMMERZ"
              ? `SSLCommerz · ${order.order.paymentStatus}`
              : `Cash on delivery · ${order.order.paymentStatus}`}</small></div>
            <span className={`business-order-status status-${order.status.toLowerCase()}`}>{order.status}</span>
          </div>
          <div className="business-order-body">
            <div className="business-order-items">
              {order.items.map((item, index) => <span key={`${order.id}-${index}`}>{item.productNameSnapshot} × {item.quantity}</span>)}
            </div>
            <div className="business-order-address">
              <strong>{order.order.shippingAddressSnapshot.fullName} · {order.order.shippingAddressSnapshot.phone}</strong>
              <span>{order.order.shippingAddressSnapshot.addressLine}, {order.order.shippingAddressSnapshot.city}, {order.order.shippingAddressSnapshot.postalCode}</span>
            </div>
          </div>
          <div className="business-order-footer">
            <span>Total <strong>{formatPrice(order.subtotal)}</strong></span>
            {order.status === "PENDING" && <button className="profile-save" type="button" onClick={() => onConfirm(order.id)} disabled={confirmingOrderId === order.id}>{confirmingOrderId === order.id ? "Confirming…" : "Confirm order"}</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductList({
  products,
  updatingProductId,
  onUpdateAvailability,
  onUpdateStock,
}: {
  products: Product[];
  updatingProductId: string;
  onUpdateAvailability: (productId: string, inStock: boolean) => void;
  onUpdateStock: (productId: string, stockQuantity: number) => void;
}) {
  const [stockQuantities, setStockQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    setStockQuantities(Object.fromEntries(products.map((product) => [product.id, String(product.stockQuantity)])));
  }, [products]);

  if (products.length === 0) return <p className="business-empty">You haven’t listed any products yet.</p>;
  return (
    <ul className="business-product-list">
      {products.map((product) => (
        <li key={product.id}>
          {product.images[0]?.imageUrl ? <img src={product.images[0].imageUrl} alt="" /> : <span className="business-product-placeholder">▦</span>}
          <span className="business-product-info"><strong>{product.name}</strong><small>{product.category.name} · {product.brand}</small></span>
          <span className="business-product-price">{formatPrice(product.discountPrice || product.price)}</span>
          <span className="business-product-actions">
            <span className={product.stockQuantity > 0 ? "business-stock-status business-stock-available" : "business-stock-status business-stock-unavailable"}>
              {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : "Out of stock"}
            </span>
            <span className={`business-order-status status-${product.status.toLowerCase()}`}>
              {product.status === "ACTIVE" ? "Published" : product.status === "INACTIVE" ? "Hidden" : "Draft"}
            </span>
            {product.status !== "DRAFT" && (
              <button
                className="business-stock-toggle"
                type="button"
                onClick={() => onUpdateAvailability(product.id, product.status !== "ACTIVE")}
                disabled={updatingProductId === product.id}
              >
                {updatingProductId === product.id
                  ? "Updating…"
                  : product.status === "ACTIVE" ? "Hide listing" : "Publish listing"}
              </button>
            )}
          </span>
          <form
            className="business-stock-editor"
            onSubmit={(event) => {
              event.preventDefault();
              onUpdateStock(product.id, Number(stockQuantities[product.id]));
            }}
          >
            <label>
              Available units
              <input
                type="number"
                min="0"
                max="2147483647"
                step="1"
                required
                value={stockQuantities[product.id] ?? product.stockQuantity}
                onChange={(event) => setStockQuantities({ ...stockQuantities, [product.id]: event.target.value })}
              />
            </label>
            <button type="submit" className="business-stock-toggle" disabled={updatingProductId === product.id}>
              {updatingProductId === product.id ? "Saving…" : "Update stock"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
