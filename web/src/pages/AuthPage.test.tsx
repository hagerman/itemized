import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthPage } from "./AuthPage";

describe("AuthPage Force OIDC behavior", () => {
  it("redirects immediately to /api/auth/oidc/login and hides local login form when oidcForce is active", () => {
    const redirect = vi.fn();
    render(
      <AuthPage
        initialized={true}
        oidcEnabled={true}
        oidcForce={true}
        onAuthenticated={vi.fn()}
        onOidcRedirect={redirect}
      />
    );

    expect(redirect).toHaveBeenCalledWith("/api/auth/oidc/login");
    expect(screen.getByText(/Redirecting to your identity provider/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in with OIDC/i })).toHaveAttribute(
      "href",
      "/api/auth/oidc/login"
    );
    expect(screen.queryByLabelText(/Email address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
  });

  it("renders local login form and OIDC button without auto-redirecting when oidcForce is false", () => {
    const redirect = vi.fn();
    render(
      <AuthPage
        initialized={true}
        oidcEnabled={true}
        oidcForce={false}
        onAuthenticated={vi.fn()}
        onOidcRedirect={redirect}
      />
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in with OIDC/i })).toBeInTheDocument();
  });

  it("renders first-run setup form without redirecting when instance is uninitialized", () => {
    const redirect = vi.fn();
    render(
      <AuthPage
        initialized={false}
        oidcEnabled={true}
        oidcForce={true}
        onAuthenticated={vi.fn()}
        onOidcRedirect={redirect}
      />
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Create Admin Account/i })).toBeInTheDocument();
  });

  it("forwards scanned /go/... path as next query param on OIDC login links and force redirect", () => {
    window.history.pushState({}, "", "/go/i/42");
    try {
      const redirect = vi.fn();
      render(
        <AuthPage
          initialized={true}
          oidcEnabled={true}
          oidcForce={true}
          onAuthenticated={vi.fn()}
          onOidcRedirect={redirect}
        />
      );

      expect(redirect).toHaveBeenCalledWith("/api/auth/oidc/login?next=%2Fgo%2Fi%2F42");
      expect(screen.getByRole("link", { name: /Sign in with OIDC/i })).toHaveAttribute(
        "href",
        "/api/auth/oidc/login?next=%2Fgo%2Fi%2F42"
      );
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
