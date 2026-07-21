import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import API_URL from '@/config';

const REDIRECT_DELAY_MS = 3000;

const ActivateEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lang = 'fr' } = useParams();
  const { checkAuth } = useAuth();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    const activate = async () => {
      try {
        await axios.get(`${API_URL}/api/auth/activate-email`, {
          params: { token },
          withCredentials: true,
        });
        await checkAuth();
        setStatus('success');
        setTimeout(() => navigate(`/${lang}/client`, { replace: true }), REDIRECT_DELAY_MS);
      } catch {
        setStatus('error');
      }
    };

    activate();
  }, [token, lang, navigate, checkAuth]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6" data-testid="activate-email-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-2xl p-8 text-center">
          {status === 'loading' && (
            <div data-testid="activate-loading">
              <CircleNotch size={48} className="animate-spin text-[#D4AF37] mx-auto mb-4" />
              <p className="text-[#A1A1AA]">Activation de votre compte en cours…</p>
            </div>
          )}

          {status === 'success' && (
            <div data-testid="activate-success">
              <CheckCircle size={56} className="text-green-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold font-['Cormorant_Garamond'] gold-text mb-3">
                Compte activé !
              </h1>
              <p className="text-[#A1A1AA] mb-2">
                Votre adresse email a bien été vérifiée.
              </p>
              <p className="text-sm text-[#A1A1AA]">
                Vous serez redirigé(e) vers votre espace dans quelques secondes…
              </p>
            </div>
          )}

          {status === 'error' && (
            <div data-testid="activate-error">
              <XCircle size={56} className="text-red-400 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-3 text-white">
                Lien invalide ou expiré
              </h1>
              <p className="text-[#A1A1AA] mb-6">
                Ce lien d'activation est invalide ou a expiré. Vous pouvez demander un nouveau lien ci-dessous.
              </p>
              <div className="space-y-3">
                <Link
                  to={`/${lang}/verify-email`}
                  className="block w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-3 rounded-lg text-center transition-colors"
                  data-testid="activate-resend-link"
                >
                  Renvoyer le lien d'activation
                </Link>
                <Link
                  to={`/${lang}/login`}
                  className="block text-[#A1A1AA] hover:text-[#D4AF37] text-sm transition-colors"
                >
                  Retour à la connexion
                </Link>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ActivateEmail;
