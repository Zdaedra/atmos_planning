"use client";

import { useState, useEffect } from "react";
import { LogIn, KeyRound } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      // Direct routing verification on backend rejection is handled down the tree.
      window.location.href = "/dashboard";
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const res = await fetch("http://89.167.122.76:4080/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Invalid email or password");
      }

      const data = await res.json();
      // Store token
      localStorage.setItem("access_token", data.access_token);

      // Basic role routing simulation based on email
      if (email === "alexey.volvak@gmail.com") {
        window.location.href = "/admin";
      } else {
        window.location.href = "/dashboard";
      }

    } catch (err: any) {
      setError(err.message || "Connection to Atmos core failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ animation: "fadeIn 0.5s ease" }}>
        <div className="auth-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '24px', textAlign: 'left', marginBottom: '32px' }}>
          <img
            src="/atmos-logo.jpg"
            alt="Atmos Logo"
            style={{
              width: '180px', height: '180px', borderRadius: '24px', objectFit: 'cover',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', flexShrink: 0
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h1 className="auth-title" style={{ fontSize: '32px' }}>Atmos Planning</h1>
            <p className="auth-subtitle" style={{ fontSize: '16px' }}>Operational Hub Login</p>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {error && <p className="error-msg">{error}</p>}

          <div className="input-group">
            <label className="input-label" htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              className="input-field"
              placeholder="supervisor@atmos.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <div className="loading-spinner"></div> : (
              <>
                <LogIn size={20} />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: "12px", color: "#94a3b8", marginTop: "16px" }}>
          Secure Atmos Control Center Connection
        </div>
      </div>
    </div>
  );
}
