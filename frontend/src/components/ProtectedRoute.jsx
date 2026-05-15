import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  const { getLocalizedPath } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={getLocalizedPath('/login')} state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    const dashboards = {
      client: '/client',
      driver: '/driver',
      admin: '/admin',
    };

    return <Navigate to={getLocalizedPath(dashboards[user.role] || '/')} replace />;
  }

  return children;
};

export default ProtectedRoute;
