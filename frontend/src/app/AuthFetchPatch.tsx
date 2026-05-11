"use client";

import { useEffect } from "react";

const API_HOSTS = ["api.trypranaextract.com"];

declare global {
  interface Window {
    __atmosFetchPatched?: boolean;
  }
}

export default function AuthFetchPatch() {
  useEffect(() => {
    if (typeof window === "undefined" || window.__atmosFetchPatched) return;
    const orig = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let target = "";
      try {
        if (typeof input === "string") target = input;
        else if (input instanceof URL) target = input.toString();
        else target = (input as Request).url || "";
      } catch {
        target = "";
      }

      const matchesApi =
        API_HOSTS.some((h) => target.includes(h)) ||
        // login endpoint should not get a Bearer header — let the original through
        false;

      if (matchesApi && !target.includes("/auth/login")) {
        const token = typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
        if (token) {
          const headers = new Headers(init?.headers || (typeof input !== "string" && !(input instanceof URL) ? (input as Request).headers : undefined));
          if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
          init = { ...(init || {}), headers };
        }
      }

      const res = await orig(input, init);
      if (res.status === 401 && matchesApi) {
        try {
          localStorage.removeItem("access_token");
        } catch {}
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }
      return res;
    };

    window.__atmosFetchPatched = true;
  }, []);

  return null;
}
