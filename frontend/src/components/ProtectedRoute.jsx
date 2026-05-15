import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { lang = 'fr' } = useParams();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${lang}/login`} state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    const dashboards = {
      client: `/${lang}/client`,
      driver: `/${lang}/driver`,
      admin: `/${lang}/admin`,
    };
    return <Navigate to={dashboards[user.role] || `/${lang}`} replace />;
  }

  return children;
};

export default ProtectedRoute;
