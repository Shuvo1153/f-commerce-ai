"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const apiUrl = "/api/v1";

type AuthFormProps = { mode: "login" | "signup" };
type AuthResponse = {
  accessToken: string;
  user: { id: string; name: string; email: string };
};

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { name, email, password } : { email, password }),
      });
      const data = await response.json() as AuthResponse & { message?: string | string[] };
      if (!response.ok) {
        setError(Array.isArray(data.message) ? data.message.join(" ") : data.message || "We couldn’t sign you in. Please try again.");
        return;
      }
      localStorage.setItem("fcommerce.session", JSON.stringify(data));
      router.replace("/");
    } catch {
      setError("Can’t reach the store right now. Make sure the project is running and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-story">
          <Link className="shop-brand auth-brand" href="/login"><span className="brand-mark">f</span><span>fcommerce<span className="brand-dot">.</span></span></Link>
          <div className="auth-story-copy">
            <span className="auth-kicker"><span /> A MARKETPLACE THAT FEELS RIGHT</span>
            <h1>Find the good<br />in every day.</h1>
            <p>Discover things you’ll love from sellers you can trust. Shopping, made simple.</p>
          </div>
          <div className="auth-story-photo"><img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85" alt="A welcoming modern shopping space" /><span>Good things are closer than you think.</span></div>
          <div className="auth-story-foot"><span>Curated finds, trusted sellers.</span><span>Made for everyday discovery.</span></div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-top"><span>{isSignup ? "NEW TO F-COMMERCE?" : "WELCOME BACK"}</span><Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create account"}</Link></div>
          <div className="auth-form-wrap">
            <span className="auth-mobile-kicker">F-COMMERCE MARKETPLACE</span>
            <h2>{isSignup ? "Create your account" : "Sign in to your account"}</h2>
            <p className="auth-subtitle">{isSignup ? "Join us and find something you’ll love." : "Your next favorite find is waiting."}</p>
            <form className="auth-form" onSubmit={submit}>
              {isSignup && <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" required minLength={2} /></label>}
              <label>Email address<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
              <label>Password
                <span className="auth-password-field">
                  <input autoComplete={isSignup ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "At least 8 characters" : "Enter your password"} required minLength={8} />
                  <button className="auth-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {showPassword
                        ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.1 3.8" /><path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.1-.8" /></>
                        : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
                    </svg>
                  </button>
                </span>
              </label>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" disabled={submitting}>{submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in"} <span>→</span></button>
            </form>
            <div className="auth-divider"><span>OR</span></div>
            <p className="auth-switch">{isSignup ? "Already have an account?" : "New to F-Commerce?"} <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create an account"}</Link></p>
            <p className="auth-terms">By continuing, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</p>
          </div>
          <div className="auth-panel-foot"><span>◇ Secure account</span><span>♡ Thoughtful shopping</span><span>✓ Trusted marketplace</span></div>
        </section>
      </div>
    </main>
  );
}
