import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import api, { clearAccessToken, setAccessToken } from "../apiInterceptor";
import { AuthContext } from "./auth-context";

type UserRole = "RIDER" | "DRIVER" | "ADMIN";

export interface User {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole[];
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  checkAuthentication: () => Promise<void>;
  establishSession: (accessToken: string, user: User) => void;
  logout: () => Promise<void>;
}

async function requestAuthentication(): Promise<{ accessToken: string; user: User } | null> {
  try {
    const response = await api.post<{ accessToken?: unknown; user?: unknown }>("/refresh");
    const accessToken = response.data.accessToken;
    const refreshedUser = response.data.user;
    if (typeof accessToken !== "string" || !refreshedUser || typeof refreshedUser !== "object") {
      return null;
    }
    return { accessToken, user: refreshedUser as User };
  } catch {
    return null;
  }
}

export const AuthContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuthentication = useCallback(async () => {
    setLoading(true);

    const session = await requestAuthentication();
    if (session) {
      setAccessToken(session.accessToken);
      setUser(session.user);
      setIsAuthenticated(true);
    } else {
      clearAccessToken();
      setUser(null);
      setIsAuthenticated(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void requestAuthentication().then((session) => {
      if (cancelled) return;
      if (session) {
        setAccessToken(session.accessToken);
        setUser(session.user);
        setIsAuthenticated(true);
      } else {
        clearAccessToken();
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const establishSession = useCallback((accessToken: string, authenticatedUser: User) => {
    setAccessToken(accessToken);
    setUser(authenticatedUser);
    setIsAuthenticated(true);
    setLoading(false);
  }, []);

  const logout = async () => {
    setLoading(true);

    try {
      await api.post("/logout");
    } catch {
      // A stale CSRF cookie should not leave a server session alive. Refresh
      // once to receive a new CSRF cookie, then retry the authenticated logout.
      try {
        await api.post("/refresh");
        await api.post("/logout");
      } catch {
        // Client credentials are still cleared below. The next protected API
        // response cannot restore this client-side auth state.
      }
    } finally {
      clearAccessToken();
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        checkAuthentication,
        establishSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

