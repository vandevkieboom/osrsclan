import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCurrentUser,
  getLoginUrl,
  logout as logoutRequest,
  type AuthUser,
} from "../services/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (next?: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Dev-only stand-in so every login-gated page/tab is visible for local
// styling under plain `npm run dev`, which has no backend to authenticate
// against at all. Never used in production — import.meta.env.DEV is false
// in a real build regardless of whether a real session is present.
const DEV_PREVIEW_USER: AuthUser = {
  id: 0,
  username: "dev-preview",
  globalName: "Dev Preview",
  avatarUrl: null,
  isAdmin: true,
  team: { id: 0, name: "Dev Team" },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      setUser(u ?? (import.meta.env.DEV ? DEV_PREVIEW_USER : null));
      setIsLoading(false);
    });
  }, []);

  const login = useCallback((next?: string) => {
    window.location.href = getLoginUrl(next ?? window.location.pathname);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAdmin: user?.isAdmin ?? false, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook must live alongside its provider/context
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
