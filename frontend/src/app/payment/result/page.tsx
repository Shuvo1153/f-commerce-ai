"use client";

import { useEffect, useState } from "react";

type PaymentStatus = {
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
};

export default function PaymentResultPage() {
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [message, setMessage] = useState("Checking your payment status…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get("orderNumber");
    if (!orderNumber) {
      setMessage("The payment return link is missing its order number.");
      setLoading(false);
      return () => { active = false; };
    }

    const storedSession = localStorage.getItem("fcommerce.session");
    if (!storedSession) {
      setMessage("Sign in to view this order’s payment status.");
      setLoading(false);
      return () => { active = false; };
    }

    let accessToken: string;
    try {
      const session = JSON.parse(storedSession) as { accessToken?: unknown };
      if (typeof session.accessToken !== "string" || !session.accessToken) {
        throw new Error("Missing access token.");
      }
      accessToken = session.accessToken;
    } catch {
      setMessage("Your sign-in session is invalid. Sign in again to view payment status.");
      setLoading(false);
      return () => { active = false; };
    }

    fetch(`/api/v1/payments/orders/${encodeURIComponent(orderNumber)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const result = await response.json() as PaymentStatus & { message?: string | string[] };
        if (!response.ok) {
          throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "Could not check the payment status.");
        }
        if (!result.orderNumber || !result.paymentStatus) {
          throw new Error("The payment service returned an invalid status.");
        }
        return result;
      })
      .then((result) => {
        if (!active) return;
        setPayment(result);
        if (result.paymentStatus === "PAID") {
          localStorage.removeItem("fcommerce.cart");
          setMessage("Payment verified. Your order is ready for the seller.");
        } else if (result.paymentStatus === "PENDING") {
          setMessage("Your payment is still processing. Check your purchase history for updates.");
        } else {
          setMessage("Payment was not completed. Your cart is still saved so you can try again.");
        }
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const paid = payment?.paymentStatus === "PAID";
  const failed = payment && payment.paymentStatus !== "PAID" && payment.paymentStatus !== "PENDING";

  return (
    <main className="payment-result-page">
      <section className="payment-result-card" aria-live="polite">
        <span className={`payment-result-icon ${paid ? "payment-result-success" : failed ? "payment-result-failed" : ""}`}>
          {loading ? <span className="spinner" /> : paid ? "✓" : failed ? "!" : "৳"}
        </span>
        <span className="section-kicker">ONLINE PAYMENT</span>
        <h1>{loading ? "Verifying your payment" : paid ? "Payment successful" : failed ? "Payment not completed" : "Payment status"}</h1>
        <p>{message}</p>
        {payment && (
          <div className="payment-result-details">
            <span>Order <strong>{payment.orderNumber}</strong></span>
            <span>Payment <strong>{payment.paymentStatus}</strong></span>
          </div>
        )}
        <div className="payment-result-actions">
          <a className="checkout-submit" href="/profile">View purchase history</a>
          <a className="payment-result-link" href="/">Continue shopping</a>
        </div>
      </section>
    </main>
  );
}
