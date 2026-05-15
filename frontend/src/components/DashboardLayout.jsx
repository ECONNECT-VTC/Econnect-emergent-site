import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  House,
  CalendarCheck,
  Car,
  Users,
  SignOut,
  List,
  X,
  ChartBar,
  CarSimple,
  UserCircle,
  CurrencyEur,
  ChartLineUp,
  Percent,
  FileText,
  Money,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

const DashboardLayout = ({ children, titleKey }) => {
  const { user, logout } = useAuth();
  const { t, getLocalizedPath, isRTL } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate(getLocalizedPath('/'));
  };

  const getNavLinks = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { name: t('dashboard'), path: '/admin', icon: ChartBar },
          { name: t('reservations'), path: '/admin/bookings', icon: CalendarCheck },
          { name: t('drivers'), path: '/admin/drivers', icon: CarSimple },
          { name: t('clients'), path: '/admin/clients', icon: Users },
          { name: t('pricing'), path: '/admin/pricing', icon: CurrencyEur },
          { name: t('finance'), path: '/admin/financial', icon: ChartLineUp },
          { name: t('commissions'), path: '/admin/commissions', icon: Percent },
          { name: t('documents'), path: '/admin/documents', icon: FileText },
        ];
      case 'driver':
        return [
          { name: t('myRides'), path: '/driver', icon: Car },
          { name: t('myEarnings'), path: '/driver/earnings', icon: Money },
        ];
      case 'client':
      default:
        return [
          { name: t('dashboard'), path: '/client', icon: House },
          { name: t('myBookings'), path: '/client/bookings', icon: CalendarCheck },
          { name: t('newRide'), path: '/client/new-booking', icon: Car },
        ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <div className={`min-h-screen bg-[#0A0A0A] flex ${isRTL ? 'flex-row-reverse' : ''}`} data-testid="dashboard-layout">
      <aside
        className={`fixed inset-y-0 z-50 w-64 bg-[#141414] ${
          isRTL ? 'right-0 border-l' : 'left-0 border-r'
        } border-white/10 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/10">
            <Link to={getLocalizedPath('/')} className="text-2xl font-bold font-['Cormorant_Garamond'] gold-text">
              Econnect VTC
            </Link>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {navLinks.map((link) => {
              const localizedPath = getLocalizedPath(link.path);
              const isActive = location.pathname === localizedPath;

              return (
                <Link
                  key={link.path}
                  to={localizedPath}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                    isRTL ? 'flex-row-reverse text-right' : ''
                  } ${
                    isActive
                      ? 'bg-[#D4AF37] text-[#0A0A0A]'
                      : 'text-[#A1A1AA] hover:bg-white/5 hover:text-white'
                  }`}
                  data-testid={`nav-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <link.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                  <span className="font-medium">{link.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className={`flex items-center gap-3 px-4 py-3 mb-2 ${isRTL ? 'flex-row-reverse text-right' : ''}`}>
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
              <SignOut size={18} className={isRTL ? 'ml-2' : 'mr-2'} />
              {t('logout')}
            </Button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`flex-1 ${isRTL ? 'lg:mr-64' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-lg border-b border-white/10">
          <div className={`flex items-center justify-between px-6 py-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                className="lg:hidden text-white hover:text-[#D4AF37]"
                data-testid="mobile-menu-btn"
              >
                {sidebarOpen ? <X size={24} /> : <List size={24} />}
              </button>
              <h1 className="text-xl md:text-2xl font-bold font-['Cormorant_Garamond']">{t(titleKey)}</h1>
            </div>
          </div>
        </header>

        <main className="p-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
