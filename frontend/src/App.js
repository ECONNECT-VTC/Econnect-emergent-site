import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
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
import AdminFleet from '@/pages/admin/AdminFleet';
import AdminPricing from '@/pages/admin/AdminPricing.jsx';
import BookingDetail from '@/pages/BookingDetail';
import BookingPaymentCancel from '@/pages/BookingPaymentCancel';
import BookingPaymentSuccess from '@/pages/BookingPaymentSuccess';
import ClientBookings from '@/pages/client/ClientBookings';
import ClientDashboard from '@/pages/client/ClientDashboard';
import NewBooking from '@/pages/client/NewBooking';
import DriverDashboard from '@/pages/driver/DriverDashboard';
import DriverEarnings from '@/pages/driver/DriverEarnings';
import DriverInvoiceSection from '@/pages/driver/DriverInvoiceSection';
import './App.css';

const VALID_LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'ja', 'ko', 'zh', 'ar'];

// Computed once at module load time
const defaultLangPath = (() => {
  const stored = localStorage.getItem('preferred-lang');
  if (stored && VALID_LANGS.includes(stored)) return '/' + stored;
  const browserLang = (navigator.language || '').split('-')[0].toLowerCase();
  if (VALID_LANGS.includes(browserLang)) return '/' + browserLang;
  return '/fr';
})();

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="booking/confirmation" element={<BookingPaymentSuccess />} />
      <Route path="booking/cancel" element={<BookingPaymentCancel />} />

      {/* Admin routes */}
      <Route
        path="admin"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Dashboard Admin">
              <AdminDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/bookings"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Réservations">
              <AdminBookings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/bookings/:bookingId"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Détail de la course">
              <BookingDetail />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/clients"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Clients">
              <AdminClients />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/commissions"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Commissions">
              <AdminCommissions />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/documents"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Documents">
              <AdminDocuments />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/drivers"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Chauffeurs">
              <AdminDrivers />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/financial"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Finance">
              <AdminFinancialDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/pricing"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Tarifs">
              <AdminPricing />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="admin/fleet"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout title="Flotte Admin">
              <AdminFleet />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Client routes */}
      <Route
        path="client"
        element={
          <ProtectedRoute role="client">
            <DashboardLayout title="Mon Espace">
              <ClientDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="client/bookings"
        element={
          <ProtectedRoute role="client">
            <DashboardLayout title="Mes Réservations">
              <ClientBookings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="client/bookings/:bookingId"
        element={
          <ProtectedRoute role="client">
            <DashboardLayout title="Détail de la course">
              <BookingDetail />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="client/new-booking"
        element={
          <ProtectedRoute role="client">
            <DashboardLayout title="Nouvelle Course">
              <NewBooking />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Driver routes */}
      <Route
        path="driver"
        element={
          <ProtectedRoute role="driver">
            <DashboardLayout title="Mes Courses">
              <DriverDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="driver/earnings"
        element={
          <ProtectedRoute role="driver">
            <DashboardLayout title="Mes Gains">
              <DriverEarnings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="driver/invoices"
        element={
          <ProtectedRoute role="driver">
            <DashboardLayout title="Mes Factures">
              <DriverInvoiceSection />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="driver/bookings/:bookingId"
        element={
          <ProtectedRoute role="driver">
            <DashboardLayout title="Détail de la course">
              <BookingDetail />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function LanguageWrapper() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </LanguageProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={defaultLangPath} replace />} />
        <Route path="/:lang/*" element={<LanguageWrapper />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
