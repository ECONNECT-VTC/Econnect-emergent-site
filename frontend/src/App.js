import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { DEFAULT_LANGUAGE } from '@/translations';
import DashboardLayout from '@/components/DashboardLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import ForgotPassword from '@/pages/ForgotPassword';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ResetPassword from '@/pages/ResetPassword';
import AdminBookings from '@/pages/admin/AdminBookings';
import AdminClients from '@/pages/admin/AdminClients';
import AdminCommissions from '@/pages/admin/AdminCommissions';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminDocuments from '@/pages/admin/AdminDocuments';
import AdminDrivers from '@/pages/admin/AdminDrivers';
import AdminFinancialDashboard from '@/pages/admin/AdminFinancialDashboard';
import AdminPricing from '@/pages/admin/AdminPricing';
import ClientBookings from '@/pages/client/ClientBookings';
import ClientDashboard from '@/pages/client/ClientDashboard';
import NewBooking from '@/pages/client/NewBooking';
import DriverDashboard from '@/pages/driver/DriverDashboard';
import DriverEarnings from '@/pages/driver/DriverEarnings';
import './App.css';

const BarePathRedirect = () => {
  const location = useLocation();
  const { getLocalizedPath, preferredLanguage } = useLanguage();

  return (
    <Navigate
      to={getLocalizedPath(
        `${location.pathname}${location.search}${location.hash}`,
        preferredLanguage,
      )}
      replace
    />
  );
};

const LanguageRouteGuard = () => {
  const { lang } = useParams();
  const location = useLocation();
  const { isValidLanguage, getLocalizedPath } = useLanguage();

  if (isValidLanguage(lang)) {
    return <Outlet />;
  }

  const segments = location.pathname.split('/').filter(Boolean);
  const nextPath =
    segments.length > 1 && /^[a-z]{2,3}$/i.test(segments[0])
      ? `/${segments.slice(1).join('/')}`
      : location.pathname;

  return (
    <Navigate
      to={getLocalizedPath(`${nextPath}${location.search}${location.hash}`, DEFAULT_LANGUAGE)}
      replace
    />
  );
};

const ProtectedLayoutRoute = ({ role, titleKey, children }) => (
  <ProtectedRoute role={role}>
    <DashboardLayout titleKey={titleKey}>{children}</DashboardLayout>
  </ProtectedRoute>
);

const LocalizedNotFoundRedirect = () => {
  const { lang } = useParams();

  return <Navigate to={`/${lang || DEFAULT_LANGUAGE}`} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to={`/${DEFAULT_LANGUAGE}`} replace />} />
    <Route path="/login" element={<BarePathRedirect />} />
    <Route path="/register" element={<BarePathRedirect />} />
    <Route path="/forgot-password" element={<BarePathRedirect />} />
    <Route path="/reset-password" element={<BarePathRedirect />} />
    <Route path="/admin/*" element={<BarePathRedirect />} />
    <Route path="/client/*" element={<BarePathRedirect />} />
    <Route path="/driver/*" element={<BarePathRedirect />} />

    <Route path="/:lang" element={<LanguageRouteGuard />}>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />

      <Route
        path="admin"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="dashboard">
            <AdminDashboard />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/bookings"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="reservations">
            <AdminBookings />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/clients"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="clients">
            <AdminClients />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/commissions"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="commissions">
            <AdminCommissions />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/documents"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="documents">
            <AdminDocuments />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/drivers"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="drivers">
            <AdminDrivers />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/financial"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="finance">
            <AdminFinancialDashboard />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="admin/pricing"
        element={
          <ProtectedLayoutRoute role="admin" titleKey="pricing">
            <AdminPricing />
          </ProtectedLayoutRoute>
        }
      />

      <Route
        path="client"
        element={
          <ProtectedLayoutRoute role="client" titleKey="mySpace">
            <ClientDashboard />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="client/bookings"
        element={
          <ProtectedLayoutRoute role="client" titleKey="myBookings">
            <ClientBookings />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="client/new-booking"
        element={
          <ProtectedLayoutRoute role="client" titleKey="newRide">
            <NewBooking />
          </ProtectedLayoutRoute>
        }
      />

      <Route
        path="driver"
        element={
          <ProtectedLayoutRoute role="driver" titleKey="myRides">
            <DriverDashboard />
          </ProtectedLayoutRoute>
        }
      />
      <Route
        path="driver/earnings"
        element={
          <ProtectedLayoutRoute role="driver" titleKey="myEarnings">
            <DriverEarnings />
          </ProtectedLayoutRoute>
        }
      />

      <Route path="*" element={<LocalizedNotFoundRedirect />} />
    </Route>

    <Route path="*" element={<Navigate to={`/${DEFAULT_LANGUAGE}`} replace />} />
  </Routes>
);

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
