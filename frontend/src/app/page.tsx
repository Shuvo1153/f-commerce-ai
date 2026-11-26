"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AiChat from "../components/ai-chat";
import { CatalogProduct, formatPrice, getProductImage, productPhotos } from "../lib/product-catalog";

const apiUrl = "/api/v1";
const categoryOrder = ["Electronics", "Shirts", "Pants", "Sneakers", "Perfumes", "Men's Collection", "Women's Collection", "Bags"];

type Cart = Record<string, number>;

type ShippingAddress = {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
};

type SavedAddress = ShippingAddress & { id: string };

type OrderConfirmation = {
  orderNumber: string;
  totalAmount: string;
};

type Session = {
  accessToken: string;
  user: { id: string; name: string; email: string };
};

function readCart(): Cart {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem("fcommerce.cart") || "{}");
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter((entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] > 0),
    );
  } catch {
    return {};
  }
}

function isAiSearchResponse(value: unknown): value is { productIds: string[]; source?: "ai" | "catalog" } {
  return typeof value === "object" && value !== null &&
    "productIds" in value && Array.isArray(value.productIds) &&
    value.productIds.every((id) => typeof id === "string") &&
    (!("source" in value) || value.source === "ai" || value.source === "catalog");
}

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [aiSearchResultIds, setAiSearchResultIds] = useState<string[] | null>(null);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchNotice, setAiSearchNotice] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [cartToast, setCartToast] = useState<{ id: number; productName: string } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_DELIVERY" | "SSLCOMMERZ">("CASH_ON_DELIVERY");
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<"default" | "new">("new");
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: "",
    phone: "",
    addressLine: "",
    city: "",
    postalCode: "",
    country: "Bangladesh",
  });
  const searchRequestId = useRef(0);
  const cartToastId = useRef(0);

  useEffect(() => {
    setCart(readCart());
    const stored = localStorage.getItem("fcommerce.session");
    if (stored) {
      try {
        const currentSession = JSON.parse(stored) as Session;
        if (!currentSession.accessToken || !currentSession.user?.id) {
          throw new Error("Session is incomplete.");
        }
        setSession(currentSession);
      } catch {
        localStorage.removeItem("fcommerce.session");
      }
    }

    fetch(`${apiUrl}/products`)
      .then(async (response) => {
        if (!response.ok) throw new Error("We couldn't load the product catalog.");
        return response.json() as Promise<CatalogProduct[]>;
      })
      .then(setProducts)
      .catch(() => setError("Products couldn’t load. Please check that the API and database are running, then refresh."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!cartOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setCartOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cartOpen]);

  useEffect(() => {
    if (!cartToast) return;
    const timeoutId = window.setTimeout(() => setCartToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [cartToast]);

  const categories = useMemo(() => {
    const available = new Set(products.map((product) => product.category?.name).filter((name): name is string => Boolean(name)));
    const ordered = categoryOrder.filter((name) => name === "Men's Collection" || available.has(name));
    const additional = Array.from(available).filter((name) => !categoryOrder.includes(name)).sort();
    return ["All", ...ordered, ...additional];
  }, [products]);
  const productMatchesCategory = (product: CatalogProduct) =>
    category === "All" || product.category?.name === category;
  const visibleProducts = aiSearchResultIds === null
    ? products.filter((product) => {
      const matchesSearch = `${product.name} ${product.brand} ${product.description}`.toLowerCase().includes(search.toLowerCase());
      return matchesSearch && productMatchesCategory(product);
    })
    : aiSearchResultIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is CatalogProduct => Boolean(product))
      .filter(productMatchesCategory);
  const searchResultsActive = Boolean(search.trim() && (aiSearchLoading || aiSearchResultIds !== null || aiSearchNotice));
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const cartProducts = Object.entries(cart).map(([id, quantity]) => ({
    id,
    quantity,
    product: products.find((item) => item.id === id),
  }));
  const cartTotal = cartProducts.reduce(
    (total, { product, quantity }) =>
      total + (product ? Number(product.discountPrice || product.price) * quantity : 0),
    0,
  );

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      setAiSearchResultIds(null);
      setAiSearchNotice("");
      document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const requestId = ++searchRequestId.current;
    setCategory("All");
    setAiSearchLoading(true);
    setAiSearchNotice("");
    try {
      const response = await fetch(`${apiUrl}/ai/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isAiSearchResponse(result)) {
        throw new Error("AI search is unavailable.");
      }
      if (requestId !== searchRequestId.current) return;
      if (result.productIds.length > 0) {
        setAiSearchResultIds(result.productIds);
        setAiSearchNotice(result.source === "catalog"
          ? `AI search is unavailable. Showing ${result.productIds.length} matching products from the catalog.`
          : `AI found ${result.productIds.length} relevant product${result.productIds.length === 1 ? "" : "s"}.`);
      } else {
        setAiSearchResultIds(null);
        setAiSearchNotice("AI couldn’t find a close match. Showing direct matches instead.");
      }
    } catch {
      if (requestId !== searchRequestId.current) return;
      setAiSearchResultIds(null);
      setAiSearchNotice("AI search is unavailable right now. Showing direct matches instead.");
    } finally {
      if (requestId === searchRequestId.current) {
        setAiSearchLoading(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  function updateSearch(value: string) {
    searchRequestId.current++;
    setAiSearchLoading(false);
    setAiSearchResultIds(null);
    setAiSearchNotice("");
    setSearch(value);
  }

  function addToCart(product: CatalogProduct) {
    const nextCart = { ...cart, [product.id]: (cart[product.id] || 0) + 1 };
    setCart(nextCart);
    localStorage.setItem("fcommerce.cart", JSON.stringify(nextCart));
    setCartToast({ id: ++cartToastId.current, productName: product.name });
  }

  function removeFromCart(productId: string) {
    const nextCart = { ...cart };
    delete nextCart[productId];
    setCart(nextCart);
    localStorage.setItem("fcommerce.cart", JSON.stringify(nextCart));
  }

  async function startCheckout() {
    if (!session) {
      router.push("/login");
      return;
    }
    setCheckoutError("");
    setCheckoutOpen(true);
    setCheckoutLoading(true);
    setPaymentMethod("CASH_ON_DELIVERY");
    setDeliveryChoice("new");
    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      const profile = await response.json() as {
        message?: string | string[];
        phone?: string | null;
        defaultAddress?: SavedAddress | null;
      };
      if (!response.ok) {
        throw new Error(Array.isArray(profile.message) ? profile.message.join(" ") : profile.message || "Couldn't load your saved delivery address.");
      }
      setDefaultAddress(profile.defaultAddress || null);
      setDeliveryChoice(profile.defaultAddress ? "default" : "new");
      setShippingAddress((address) => ({
        ...address,
        fullName: address.fullName || session?.user.name || "",
        phone: address.phone || profile.phone || "",
      }));
    } catch (requestError) {
      setDefaultAddress(null);
      setCheckoutError(requestError instanceof Error ? requestError.message : "Couldn't load your saved delivery address.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    if (cartProducts.some(({ product }) => !product)) {
      setCheckoutError("Remove unavailable products from your cart before placing the order.");
      return;
    }
    const deliveryAddress = deliveryChoice === "default" ? defaultAddress : shippingAddress;
    if (!deliveryAddress) {
      setCheckoutError("Choose or enter a delivery address.");
      return;
    }

    setCheckoutSubmitting(true);
    setCheckoutError("");
    try {
      const response = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          items: cartProducts.map(({ id, quantity }) => ({ productId: id, quantity })),
          shippingAddress: deliveryAddress,
          paymentMethod,
        }),
      });
      const result = await response.json() as {
        message?: string | string[];
        orderNumber?: string;
        totalAmount?: string;
        paymentMethod?: "CASH_ON_DELIVERY" | "SSLCOMMERZ";
        gatewayUrl?: string;
      };
      if (!response.ok) {
        throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "We couldn't place your order.");
      }
      if (!result.orderNumber || !result.totalAmount) {
        throw new Error("The order service returned an invalid confirmation.");
      }
      if (paymentMethod === "SSLCOMMERZ") {
        if (result.paymentMethod !== "SSLCOMMERZ" || !result.gatewayUrl) {
          throw new Error("The online payment service returned an invalid checkout session.");
        }
        window.location.assign(result.gatewayUrl);
        return;
      }
      setOrderConfirmation({
        orderNumber: result.orderNumber,
        totalAmount: result.totalAmount,
      });
      setCart({});
      localStorage.removeItem("fcommerce.cart");
    } catch (requestError) {
      setCheckoutError(requestError instanceof Error ? requestError.message : "We couldn't place your order.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  function closeOrderConfirmation() {
    setOrderConfirmation(null);
    setCheckoutOpen(false);
    setCartOpen(false);
  }

  const avatarInitials = session?.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
  const checkoutSubmitLabel = checkoutSubmitting
    ? paymentMethod === "SSLCOMMERZ" ? "Connecting to SSLCommerz…" : "Placing order…"
    : paymentMethod === "SSLCOMMERZ" ? `Continue to online payment · ${formatPrice(cartTotal)}` : `Place order · ${formatPrice(cartTotal)}`;

  return (
    <main>
      <div className="utility-bar">
        <div className="shop-container utility-content">
          <span>Thoughtful finds. Great prices. Delivered to your door.</span>
          <span>Need help? <a href="mailto:support@fcommerce.local">Contact us</a></span>
        </div>
      </div>
      <header className="shop-header">
        <div className="shop-container header-main">
          <a className="shop-brand" href="/" aria-label="F-Commerce home"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></a>
          <form className="shop-search" onSubmit={submitSearch}>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input maxLength={200} value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Try “comfortable shoes under ৳5,000”" aria-label="Search products" />
            {search && <button className="search-clear" type="button" onClick={() => updateSearch("")} aria-label="Clear search">×</button>}
            <button type="submit" disabled={aiSearchLoading || !search.trim()}>{aiSearchLoading ? "Searching…" : "Search"}</button>
          </form>
          <div className="header-account">
            <button className="icon-action cart-action" type="button" aria-label={`Cart with ${cartCount} items`} aria-expanded={cartOpen} onClick={() => setCartOpen(true)}><span>♧</span><b>Cart</b><i>{cartCount}</i></button>
            <a className="header-profile" href={session ? "/profile" : "/login"} aria-label={session ? "My profile" : "Sign in"} title={session ? "My profile" : "Sign in"}>
              <span className="header-avatar">{avatarInitials}</span>
            </a>
          </div>
        </div>
      </header>

      {cartOpen && (
        <div className="cart-overlay">
          <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} />
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="cart-drawer-heading">
              <div><span className="section-kicker">YOUR SELECTION</span><h2 id="cart-title">Shopping cart <span>({cartCount})</span></h2></div>
              <button className="cart-close" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}>×</button>
            </div>
            {orderConfirmation ? (
              <div className="order-confirmation" role="status">
                <span className="order-confirmation-icon">✓</span>
                <h3>Order placed</h3>
                <p>Order <strong>{orderConfirmation.orderNumber}</strong> is confirmed. Pay {formatPrice(orderConfirmation.totalAmount)} when it arrives.</p>
                <span className="cod-label">CASH ON DELIVERY</span>
                <button className="checkout-submit" type="button" onClick={closeOrderConfirmation}>Continue shopping</button>
              </div>
            ) : checkoutOpen ? (
              <form className="checkout-form" onSubmit={placeOrder}>
                <button className="checkout-back" type="button" onClick={() => setCheckoutOpen(false)}>← Back to cart</button>
                <h3>Delivery details</h3>
                <p className="checkout-payment-note">Choose how to pay · Subtotal {formatPrice(cartTotal)}</p>
                <fieldset className="delivery-choice payment-choice">
                  <legend>Payment method</legend>
                  <label className="delivery-choice-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "CASH_ON_DELIVERY"}
                      onChange={() => setPaymentMethod("CASH_ON_DELIVERY")}
                    />
                    <span><strong>Cash on delivery</strong><small>Pay when your order arrives.</small></span>
                  </label>
                  <label className="delivery-choice-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "SSLCOMMERZ"}
                      onChange={() => setPaymentMethod("SSLCOMMERZ")}
                    />
                    <span><strong>Online payment</strong><small>Pay securely with bKash, Nagad, or other available methods on SSLCommerz.</small></span>
                  </label>
                </fieldset>
                {checkoutLoading ? (
                  <p className="cart-empty"><span className="spinner" /> Loading saved address…</p>
                ) : (
                  <>
                    <fieldset className="delivery-choice">
                      <legend>Where should we deliver?</legend>
                      {defaultAddress ? (
                        <label className="delivery-choice-option">
                          <input type="radio" name="deliveryLocation" checked={deliveryChoice === "default"} onChange={() => { setDeliveryChoice("default"); setCheckoutError(""); }} />
                          <span><strong>Default address</strong><small>{defaultAddress.fullName} · {defaultAddress.phone}<br />{defaultAddress.addressLine}, {defaultAddress.city} {defaultAddress.postalCode}, {defaultAddress.country}</small></span>
                        </label>
                      ) : (
                        <p className="delivery-no-default">No default delivery address is saved in your profile.</p>
                      )}
                      <label className="delivery-choice-option">
                        <input type="radio" name="deliveryLocation" checked={deliveryChoice === "new"} onChange={() => { setDeliveryChoice("new"); setCheckoutError(""); }} />
                        <span><strong>Use a new location</strong><small>Enter an address for this order.</small></span>
                      </label>
                    </fieldset>
                    {deliveryChoice === "new" && (
                      <>
                        <label>Full name<input required maxLength={100} value={shippingAddress.fullName} onChange={(event) => setShippingAddress({ ...shippingAddress, fullName: event.target.value })} /></label>
                        <label>Phone number<input required maxLength={30} type="tel" value={shippingAddress.phone} onChange={(event) => setShippingAddress({ ...shippingAddress, phone: event.target.value })} /></label>
                        <label>Street address<input required maxLength={300} value={shippingAddress.addressLine} onChange={(event) => setShippingAddress({ ...shippingAddress, addressLine: event.target.value })} /></label>
                        <div className="checkout-form-row">
                          <label>City<input required maxLength={100} value={shippingAddress.city} onChange={(event) => setShippingAddress({ ...shippingAddress, city: event.target.value })} /></label>
                          <label>Postal code<input required maxLength={20} value={shippingAddress.postalCode} onChange={(event) => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })} /></label>
                        </div>
                        <label>Country<input required maxLength={100} value={shippingAddress.country} onChange={(event) => setShippingAddress({ ...shippingAddress, country: event.target.value })} /></label>
                      </>
                    )}
                  </>
                )}
                {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                <button className="checkout-submit" type="submit" disabled={checkoutLoading || checkoutSubmitting || cartProducts.length === 0 || (deliveryChoice === "default" && !defaultAddress)}>
                  {checkoutSubmitLabel}
                </button>
              </form>
            ) : loading && cartCount > 0 ? (
              <p className="cart-empty">Loading your cart…</p>
            ) : cartProducts.length === 0 ? (
              <p className="cart-empty">Your cart is empty. Add a product to see it here.</p>
            ) : (
              <>
                <ul className="cart-items">
                  {cartProducts.map(({ id, product, quantity }) => {
                    const image = product ? getProductImage(product) : undefined;
                    return (
                      <li className="cart-item" key={id}>
                        {image && <img src={image} alt="" />}
                        <div className="cart-item-details">
                          <strong>{product?.name || "Product no longer available"}</strong>
                          {product && <span>{formatPrice(product.discountPrice || product.price)} each</span>}
                          <span className="cart-item-quantity">Quantity: {quantity}</span>
                        </div>
                        <button className="cart-remove" type="button" onClick={() => removeFromCart(id)} aria-label={`Remove ${product?.name || "unavailable product"} from cart`}>Remove</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="cart-total"><span>Subtotal</span><strong>{formatPrice(cartTotal)}</strong></div>
                <div className="cart-payment-method"><span>Payment method</span><strong>Cash on delivery</strong></div>
                <button className="checkout-submit" type="button" onClick={startCheckout} disabled={cartProducts.some(({ product }) => !product)}>Proceed to checkout</button>
              </>
            )}
          </aside>
        </div>
      )}

      <div className="shop-container">
        {!searchResultsActive && (
          <>
            <section className="shop-hero">
              <div className="hero-copy">
                <span className="hero-kicker"><span /> YOUR NEW FAVORITE MARKETPLACE</span>
                <h1>Good finds.<br /><span>Better everyday.</span></h1>
                <p>Discover carefully chosen products from trusted sellers, all in one place.</p>
                <a className="hero-button" href="#products">Explore products <span>↗</span></a>
                <div className="hero-proof"><span className="proof-avatars">✓</span><span><strong>Easy, reliable shopping</strong><small>From discovery to delivery</small></span></div>
              </div>
              <div className="hero-art" aria-label="Featured electronics">
                <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                <div className="hero-image-card hero-phone"><img src={productPhotos.Samsung} alt="Featured smartphone" /></div>
                <div className="hero-image-card hero-headphones"><img src={productPhotos.Sony} alt="Featured headphones" /></div>
                <div className="hero-tag"><span>CURATED FOR YOU</span><strong>Fresh picks,</strong><strong>fair prices.</strong></div>
                <span className="hero-sparkle sparkle-one">✳</span><span className="hero-sparkle sparkle-two">✦</span>
              </div>
            </section>

            <section className="benefit-row" id="benefits" aria-label="Shopping benefits">
              <div className="benefit-item"><span className="benefit-icon">◇</span><span><strong>Trusted sellers</strong><small>Quality you can count on</small></span></div>
              <div className="benefit-item"><span className="benefit-icon">↗</span><span><strong>Great value</strong><small>Fair prices, every day</small></span></div>
              <div className="benefit-item"><span className="benefit-icon">⌂</span><span><strong>Easy delivery</strong><small>From shop to your door</small></span></div>
            </section>
          </>
        )}

        <section className={`catalog-section${searchResultsActive ? " search-results-section" : ""}`} id="products">
          <div className={searchResultsActive ? "search-results-heading" : "catalog-heading"}>
            {searchResultsActive ? (
              <>
                <div>
                  <button className="search-back-button" type="button" onClick={() => updateSearch("")}>← Back to shopping</button>
                  <span className="section-kicker">SEARCH RESULTS</span>
                  <h2>Recommended products</h2>
                  <p>Showing matches for “{search.trim()}”</p>
                </div>
                <span className="product-count">{aiSearchLoading ? "Searching…" : `${visibleProducts.length} results`}</span>
              </>
            ) : (
              <>
                <div><span className="section-kicker">THE GOOD STUFF</span><h2>Find something you’ll love</h2><p>Explore our latest picks from verified sellers.</p></div>
                <span className="product-count">{products.length} products</span>
              </>
            )}
          </div>
          {!searchResultsActive && (
            <div className="category-pills" aria-label="Filter by category">
              {categories.map((item) => <button key={item} className={category === item ? "category-pill selected" : "category-pill"} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
          )}

          {aiSearchLoading && <div className="ai-search-notice" role="status"><span className="spinner" />Finding relevant products with AI…</div>}
          {!aiSearchLoading && aiSearchNotice && <div className="ai-search-notice" role="status">{aiSearchNotice}</div>}
          {loading && <div className="catalog-state"><span className="spinner" />Loading products…</div>}
          {!loading && error && <div className="catalog-state catalog-error">{error}</div>}
          {!loading && !error && visibleProducts.length === 0 && <div className="catalog-state">No products match that search. Try another name or category.</div>}
          {!loading && !error && visibleProducts.length > 0 && (
            <div className="product-grid">
              {visibleProducts.map((product, index) => {
                const price = product.discountPrice || product.price;
                return (
                  <article className="shop-product-card" id={`product-${product.id}`} key={product.id}>
                    <div className={`product-image product-image-${index % 4}`}>
                      <span className="product-badge">{index === 0 ? "POPULAR PICK" : "JUST IN"}</span>
                      <button className="favorite-button" aria-label={`Save ${product.name}`} type="button">♡</button>
                      <Link href={`/products/${product.id}`} className="product-image-link" aria-label={`View ${product.name} details`}>
                        <img src={getProductImage(product)} alt={product.name} loading="lazy" />
                      </Link>
                    </div>
                    <div className="product-information">
                      <span className="product-category">{product.category?.name || product.brand}</span>
                      <h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3>
                      <p className="product-description">{product.description}</p>
                      <div className="seller-line"><span className="seller-check">✓</span>{product.seller?.businessName || "Verified seller"}</div>
                      <div className="product-bottom"><strong className="product-price">{formatPrice(price)}</strong><button className="add-button" onClick={() => addToCart(product)} aria-label={`Add ${product.name} to cart`}>+</button></div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        {!searchResultsActive && <footer className="shop-footer"><a className="shop-brand footer-brand" href="/"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></a><span>Shopping made a little more delightful.</span><span>© 2026 F-Commerce</span></footer>}
      </div>
      {cartToast && (
        <div key={cartToast.id} className="cart-toast" role="status" aria-atomic="true">
          <span className="cart-toast-icon" aria-hidden="true">✓</span>
          <span className="cart-toast-copy">
            <strong>Added to cart</strong>
            <small>{cartToast.productName}</small>
          </span>
          <button type="button" className="cart-toast-dismiss" onClick={() => setCartToast(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
      <AiChat />
    </main>
  );
}
