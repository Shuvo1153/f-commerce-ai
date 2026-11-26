"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CatalogProduct, formatPrice, getProductImage } from "../../../lib/product-catalog";

const apiUrl = "/api/v1";

type ProductDetail = CatalogProduct & {
  images: (NonNullable<CatalogProduct["images"]>[number] & { id: string })[];
  variants: {
    id: string;
    variantName: string;
    variantValue: string;
    priceAdjustment: string | number;
  }[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string }[];
};

type PageState = "loading" | "ready" | "not-found" | "error";

function getErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return "We couldn’t load this product. Please try again.";
  }
  const { message } = value;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(" ");
  }
  return "We couldn’t load this product. Please try again.";
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [pageState, setPageState] = useState<PageState>("loading");
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setPageState("loading");

    async function loadProduct() {
      try {
        const response = await fetch(`${apiUrl}/products/${encodeURIComponent(id)}`);
        const result: unknown = await response.json();
        if (response.status === 404) {
          if (active) setPageState("not-found");
          return;
        }
        if (!response.ok) throw new Error(getErrorMessage(result));
        if (typeof result !== "object" || result === null || !("id" in result)) {
          throw new Error("The product service returned invalid details.");
        }
        const details = result as ProductDetail;
        if (active) {
          setProduct(details);
          setSelectedImage(getProductImage(details));
          try {
            const saved: unknown = JSON.parse(localStorage.getItem("fcommerce.cart") || "{}");
            if (typeof saved === "object" && saved !== null && !Array.isArray(saved)) {
              const quantity = (saved as Record<string, unknown>)[details.id];
              setCartQuantity(typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
            }
          } catch {
            setCartQuantity(0);
          }
          setPageState("ready");
        }
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "We couldn’t load this product. Please try again.");
        setPageState("error");
      }
    }

    void loadProduct();
    return () => {
      active = false;
    };
  }, [id]);

  function addToCart() {
    if (!product) return;
    let cart: Record<string, number> = {};
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("fcommerce.cart") || "{}");
      if (typeof saved === "object" && saved !== null && !Array.isArray(saved)) {
        cart = Object.fromEntries(
          Object.entries(saved).filter((entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] > 0),
        );
      }
    } catch {
      cart = {};
    }
    if (!product.inStock) return;
    const quantity = (cart[product.id] || 0) + 1;
    if (quantity > 99) return;
    cart[product.id] = quantity;
    localStorage.setItem("fcommerce.cart", JSON.stringify(cart));
    setCartQuantity(quantity);
    setAddedToCart(true);
  }

  if (pageState === "loading") {
    return <main className="page-loading"><span className="spinner" />Loading product…</main>;
  }

  if (pageState === "not-found") {
    return (
      <main className="product-detail-state">
        <h1>Product not found</h1>
        <p>This product may have been removed or is no longer available.</p>
        <Link className="product-detail-primary-link" href="/">Back to the marketplace</Link>
      </main>
    );
  }

  if (pageState === "error" || !product) {
    return (
      <main className="product-detail-state">
        <h1>We couldn’t show this product</h1>
        <p>{error || "Please try again in a moment."}</p>
        <Link className="product-detail-primary-link" href="/">Back to the marketplace</Link>
      </main>
    );
  }

  const primaryPrice = product.discountPrice || product.price;
  const hasDiscount = product.discountPrice !== null &&
    Number(product.discountPrice) < Number(product.price);
  const productOutOfStock = !product.inStock;

  return (
    <main className="product-detail-page">
      <header className="product-detail-header">
        <Link className="shop-brand" href="/" aria-label="F-Commerce home">
          <span className="brand-mark">f</span>
          <span>fcommerce<span className="brand-dot">.</span></span>
        </Link>
        <Link className="product-detail-header-link" href="/">Continue shopping</Link>
      </header>

      <div className="product-detail-container">
        <Link className="product-detail-back" href="/">← Back to the marketplace</Link>
        <section className="product-detail-card">
          <div className="product-gallery">
            <div className="product-detail-image">
              <img src={selectedImage || getProductImage(product)} alt={product.name} />
            </div>
            {product.images.length > 1 && (
              <div className="product-thumbnails" aria-label="Product images">
                {product.images.map((image) => (
                  <button
                    className={selectedImage === image.imageUrl ? "product-thumbnail selected" : "product-thumbnail"}
                    key={image.id}
                    type="button"
                    aria-label={`Show image of ${product.name}`}
                    aria-pressed={selectedImage === image.imageUrl}
                    onClick={() => setSelectedImage(image.imageUrl)}
                  >
                    <img src={image.imageUrl} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-detail-information">
            <span className="product-category">{product.category?.name || "Marketplace"}</span>
            <h1>{product.name}</h1>
            <p className="product-detail-brand">{product.brand}</p>
            <div className="product-detail-price">
              <strong>{formatPrice(primaryPrice)}</strong>
              {hasDiscount && <del>{formatPrice(product.price)}</del>}
            </div>
            <p className="product-detail-description">{product.description}</p>
            <div className="product-detail-seller">
              <span className="seller-check">✓</span>
              Sold by <strong>{product.seller?.businessName || "Marketplace seller"}</strong>
            </div>
            <p className={productOutOfStock ? "product-stock-unavailable" : "product-stock-available"}>
              {productOutOfStock ? "Out of Stock" : "In Stock"}
            </p>

            {product.variants.length > 0 && (
              <section className="product-variant-section" aria-labelledby="product-variants-title">
                <h2 id="product-variants-title">Product options</h2>
                <ul>
                  {product.variants.map((variant) => (
                    <li key={variant.id}>
                      <span>{variant.variantName}: <strong>{variant.variantValue}</strong></span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              className="product-detail-add"
              type="button"
              onClick={addToCart}
              disabled={productOutOfStock || cartQuantity >= 99}
            >
              {productOutOfStock ? "Out of Stock" : cartQuantity >= 99 ? "Maximum quantity per order" : addedToCart ? "Added to cart" : "Add to cart"}
            </button>
            {addedToCart && (
              <p className="product-detail-cart-message" role="status">
                Added to your cart. <Link href="/">Continue shopping</Link>
              </p>
            )}
            <p className="product-detail-review-count">
              {product.reviews.length ? `${product.reviews.length} customer reviews` : "No customer reviews yet"}
            </p>
          </div>
        </section>

        <section className="product-detail-about">
          <span className="section-kicker">PRODUCT DETAILS</span>
          <h2>About this product</h2>
          <p>{product.description}</p>
          {product.reviews.length > 0 && (
            <div className="product-review-list">
              <h3>Customer reviews</h3>
              {product.reviews.map((review) => (
                <article key={review.id}>
                  <strong>{review.rating} / 5</strong>
                  {review.comment && <p>{review.comment}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
