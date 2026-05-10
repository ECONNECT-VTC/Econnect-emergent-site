import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import DashboardLayout from '@/components/DashboardLayout';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminBookings from '@/pages/admin/AdminBookings';
import AdminDrivers from '@/pages/admin/AdminDrivers';
import AdminClients from '@/pages/admin/AdminClients';
import AdminPricing from '@/pages/admin/AdminPricing.jsx';
import ClientDashboard from '@/pages/client/ClientDashboard';
import ClientBookings from '@/pages/client/ClientBookings';
import NewBooking from '@/pages/client/NewBooking';
import DriverDashboard from '@/pages/driver/DriverDashboard';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout title="Dashboard Admin">
                  <AdminDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout title="Réservations">
                  <AdminBookings />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/drivers"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout title="Chauffeurs">
                  <AdminDrivers />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/clients"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout title="Clients">
                  <AdminClients />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pricing"
            element={
              <ProtectedRoute role="admin">
                <DashboardLayout title="Tarifs">
                  <AdminPricing />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Client routes */}
          <Route
            path="/client"
            element={
              <ProtectedRoute role="client">
                <DashboardLayout title="Mon Espace">
                  <ClientDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/bookings"
            element={
              <ProtectedRoute role="client">
                <DashboardLayout title="Mes Réservations">
                  <ClientBookings />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/client/new-booking"
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
            path="/driver"
            element={
              <ProtectedRoute role="driver">
                <DashboardLayout title="Mes Courses">
                  <DriverDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
