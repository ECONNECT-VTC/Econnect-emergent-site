import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, ArrowLeft, CircleNotch } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      return;
    }

    const verifyToken = async () => {
      try {
        await axios.get(`${API_URL}/api/auth/verify-reset-token/${token}`);
        setTokenValid(true);
      } catch {
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token,
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (verifying) {
      return (
        <div className="flex justify-center py-8" data-testid="reset-password-verifying">
          <CircleNotch size={32} className="animate-spin text-[#D4AF37]" />
        </div>
      );
    }

    if (!tokenValid) {
      return (
        <div className="text-center space-y-4" data-testid="reset-password-invalid">
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-4 rounded-lg">
            <p className="font-semibold mb-1">Lien invalide ou expiré</p>
            <p className="text-sm">
              Ce lien de réinitialisation n'est plus valide. Il a peut-être expiré ou déjà été utilisé.
            </p>
          </div>
          <Link
            to="/forgot-password"
            className="inline-block mt-2 text-[#D4AF37] hover:text-[#F0C74A] text-sm transition-colors"
          >
            Demander un nouveau lien
          </Link>
        </div>
      );
    }

    if (success) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
          data-testid="reset-password-success"
        >
          <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/50 text-[#D4AF37] px-4 py-4 rounded-lg">
            <p className="font-semibold mb-1">Mot de passe réinitialisé !</p>
            <p className="text-sm text-[#A1A1AA]">
              Votre mot de passe a été modifié avec succès. Vous allez être redirigé vers la page de connexion.
            </p>
          </div>
          <Link
            to="/login"
            className="inline-block mt-2 text-[#D4AF37] hover:text-[#F0C74A] text-sm transition-colors"
          >
            Se connecter maintenant
          </Link>
        </motion.div>
      );
    }

    return (
      <>
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6" data-testid="reset-password-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-[#A1A1AA]">Nouveau mot de passe</Label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="pl-10 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                data-testid="reset-password-new"
              />
            </div>
            <p className="text-xs text-[#A1A1AA]">Minimum 8 caractères</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-[#A1A1AA]">Confirmer le mot de passe</Label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pl-10 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                data-testid="reset-password-confirm"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6"
            data-testid="reset-password-submit"
          >
            {loading ? (
              <CircleNotch size={20} className="animate-spin" />
            ) : (
              'Réinitialiser le mot de passe'
            )}
          </Button>
        </form>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6" data-testid="reset-password-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-2xl p-8">
          {/* Back link */}
          <Link to="/login" className="inline-flex items-center text-[#A1A1AA] hover:text-[#D4AF37] mb-8 transition-colors">
            <ArrowLeft size={20} className="mr-2" />
            Retour à la connexion
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-['Cormorant_Garamond'] gold-text mb-2">
              Nouveau mot de passe
            </h1>
            <p className="text-[#A1A1AA]">Choisissez un nouveau mot de passe sécurisé</p>
          </div>

          {renderContent()}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
