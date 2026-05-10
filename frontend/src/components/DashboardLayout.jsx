import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  House, CalendarCheck, Car, Users, SignOut, List, X, ChartBar, CarSimple, UserCircle, CurrencyEur
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

const DashboardLayout = ({ children, title }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getNavLinks = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { name: 'Dashboard', path: '/admin', icon: ChartBar },
          { name: 'Réservations', path: '/admin/bookings', icon: CalendarCheck },
          { name: 'Chauffeurs', path: '/admin/drivers', icon: CarSimple },
          { name: 'Clients', path: '/admin/clients', icon: Users },
          { name: 'Tarifs', path: '/admin/pricing', icon: CurrencyEur },
        ];
      case 'driver':
        return [
          { name: 'Mes Courses', path: '/driver', icon: Car },
        ];
      case 'client':
      default:
        return [
          { name: 'Dashboard', path: '/client', icon: House },
          { name: 'Mes Réservations', path: '/client/bookings', icon: CalendarCheck },
          { name: 'Nouvelle Course', path: '/client/new-booking', icon: Car },
        ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex" data-testid="dashboard-layout">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#141414] border-r border-white/10 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <Link to="/" className="text-2xl font-bold font-['Cormorant_Garamond'] gold-text">
              Econnect VTC
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-[#D4AF37] text-[#0A0A0A]'
                      : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white'
                  }`}
                  data-testid={`nav-${link.name.toLowerCase().replace(' ', '-')}`}
                >
                  <link.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                  <span className="font-medium">{link.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User & Logout */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <UserCircle size={32} className="text-[#D4AF37]" />
              <div>
                <p className="font-medium text-white">{user?.name}</p>
                <p className="text-xs text-[#A1A1AA] capitalize">{user?.role}</p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full border-white/10 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
              data-testid="logout-btn"
            >
              <SignOut size={18} className="mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-lg border-b border-white/10">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden text-white hover:text-[#D4AF37]"
                data-testid="mobile-menu-btn"
              >
                {sidebarOpen ? <X size={24} /> : <List size={24} />}
              </button>
              <h1 className="text-xl md:text-2xl font-bold font-['Cormorant_Garamond']">{title}</h1>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
