import LoadingScreen from "./LoadingScreen";
import { useAuthContext } from "../context/auth-context";
import { Navigate, Outlet } from "react-router-dom";
import UnauthorizedPage from "./UnauthorizedPage";
export type UserRole = "RIDER" | "DRIVER" | "ADMIN";

export const ProtectedRoutes = ({
  allowedroles,
}: {
  allowedroles: UserRole[];
}) => {
  const { user, isAuthenticated, loading } = useAuthContext();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (
    allowedroles.length > 0 &&
    (!user?.role ||
      !user.role.some((role:UserRole) => allowedroles.includes(role)))
  ) {
    return <UnauthorizedPage />;
  }

  return <Outlet />;
};
