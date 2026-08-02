import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
