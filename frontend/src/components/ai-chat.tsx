"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getProductImage } from "../lib/product-catalog";

const apiUrl = "/api/v1";

type ChatProduct = {
  id: string;
  name: string;
  brand: string;
  description: string;
  price: string | number;
  discountPrice: string | number | null;
  category: { name: string };
  imageUrl: string | null;
  availability: "in stock" | "out of stock" | "not listed";
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  products?: ChatProduct[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatProduct(value: unknown): value is ChatProduct {
  if (!isRecord(value) || !isRecord(value.category)) return false;
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.brand === "string" &&
    typeof value.description === "string" &&
    (typeof value.price === "string" || typeof value.price === "number") &&
    (value.discountPrice === null || typeof value.discountPrice === "string" || typeof value.discountPrice === "number") &&
    typeof value.category.name === "string" &&
    (value.imageUrl === null || typeof value.imageUrl === "string") &&
    (value.availability === "in stock" || value.availability === "out of stock" || value.availability === "not listed");
}

function parseChatResponse(value: unknown): { reply: string; products: ChatProduct[] } | null {
  if (!isRecord(value) || typeof value.reply !== "string" ||
      !Array.isArray(value.products) || !value.products.every(isChatProduct)) {
    return null;
  }
  return { reply: value.reply, products: value.products };
}

function getErrorMessage(value: unknown) {
  if (!isRecord(value)) return "The assistant couldn’t respond. Please try again.";
  if (typeof value.message === "string") return value.message;
  if (Array.isArray(value.message) && value.message.every((item) => typeof item === "string")) {
    return value.message.join(" ");
  }
  return "The assistant couldn’t respond. Please try again.";
}

function formatPrice(value: string | number) {
  return `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export default function AiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I can help you find and compare products in our store. What are you looking for?",
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, isSending, messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;

    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch(`${apiUrl}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, history }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      const result = parseChatResponse(body);
      if (!result) throw new Error("The assistant returned an invalid response. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: result.reply, products: result.products }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The assistant couldn’t respond. Please try again.");
      setInput((current) => current.trim() ? current : message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="ai-chat-widget">
      {isOpen && (
        <section id="ai-chat-panel" className="ai-chat-panel" aria-label="F-Commerce shopping assistant">
          <header className="ai-chat-header">
            <span className="ai-chat-mark" aria-hidden="true">✦</span>
            <div>
              <strong>Shopping assistant</strong>
              <small>Product picks from your store</small>
            </div>
            <button type="button" className="ai-chat-close" onClick={() => setIsOpen(false)} aria-label="Close assistant">×</button>
          </header>

          <div className="ai-chat-log" role="log" aria-live="polite" aria-relevant="additions text">
            {messages.map((item, index) => (
              <div className={`ai-chat-message ai-chat-${item.role}`} key={`${item.role}-${index}`}>
                <p>{item.content}</p>
                {item.products && item.products.length > 0 && (
                  <div className="ai-chat-products">
                    {item.products.map((product) => {
                      const imageUrl = product.imageUrl || getProductImage(product);
                      return (
                        <article className="ai-chat-product" key={product.id}>
                          <div className="ai-chat-product-main">
                            <img src={imageUrl} alt={product.name} loading="lazy" />
                            <div>
                              <span>{product.category.name} · {product.brand}</span>
                              <strong>{product.name}</strong>
                              <small>{formatPrice(product.discountPrice ?? product.price)}</small>
                              {product.availability !== "not listed" && <small>{product.availability}</small>}
                            </div>
                          </div>
                          <Link href={`/products/${product.id}`} onClick={() => setIsOpen(false)}>View product ↗</Link>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {isSending && <p className="ai-chat-thinking"><span className="spinner" />Finding a helpful answer…</p>}
            {error && <p className="ai-chat-error" role="alert">{error}</p>}
            <div ref={bottomRef} />
          </div>

          {messages.length === 1 && (
            <div className="ai-chat-prompts" aria-label="Suggested questions">
              <button type="button" onClick={() => setInput("Find me a gift under ৳3,000")}>Gift under ৳3,000</button>
              <button type="button" onClick={() => setInput("What electronics do you recommend?")}>Explore electronics</button>
            </div>
          )}

          <form className="ai-chat-form" onSubmit={sendMessage}>
            <input
              aria-label="Message the shopping assistant"
              maxLength={500}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about products…"
            />
            <button type="submit" disabled={!input.trim() || isSending} aria-label="Send message">↑</button>
          </form>
          <p className="ai-chat-disclaimer">Suggestions are based on the products currently in our catalog.</p>
        </section>
      )}

      <button
        className="ai-chat-launcher"
        type="button"
        aria-expanded={isOpen}
        aria-controls="ai-chat-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">✦</span> {isOpen ? "Close" : "Ask AI"}
      </button>
    </div>
  );
}
