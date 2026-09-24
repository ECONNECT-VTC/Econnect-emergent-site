import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Envelope, CircleNotch, CheckCircle } from '@phosphor-icons/react';
import API_URL from '@/config';

const VerifyEmailPending = () => {
  const { lang = 'fr' } = useParams();
  const location = useLocation();
  const initialEmail = location.state?.email || '';

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/resend-activation`, { email });
      setSuccess(true);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6 py-12" data-testid="verify-email-pending-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-2xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <Envelope size={56} className="text-[#D4AF37]" />
          </div>

          <h1 className="text-3xl font-bold font-['Cormorant_Garamond'] gold-text mb-3">
            Vérifiez votre email
          </h1>
          <p className="text-[#A1A1AA] mb-6">
            Un lien d'activation a été envoyé à{' '}
            <strong className="text-white">{initialEmail || 'votre adresse email'}</strong>.
            <br />Cliquez sur ce lien pour activer votre compte.
          </p>

          <div className="bg-[#1E1E1E] rounded-lg p-4 mb-8 text-left text-sm text-[#A1A1AA]">
            <p className="mb-1">• Vérifiez vos dossiers <strong className="text-white">spam</strong> ou <strong className="text-white">courriers indésirables</strong>.</p>
            <p>• Le lien est valide pendant <strong className="text-white">24 heures</strong>.</p>
          </div>

          <div className="border-t border-white/10 pt-6">
            <p className="text-[#A1A1AA] text-sm mb-4">Vous n'avez pas reçu l'email ?</p>

            {success ? (
              <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2 justify-center" data-testid="resend-success">
                <CheckCircle size={18} />
                <span>Si cet email existe, un nouveau lien a été envoyé.</span>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm" data-testid="resend-error">
                    {error}
                  </div>
                )}
                <div className="space-y-1 text-left">
                  <Label htmlFor="resend-email" className="text-[#A1A1AA] text-sm">Email</Label>
                  <div className="relative">
                    <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
                    <Input
                      id="resend-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      required
                      className="pl-9 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50 text-sm"
                      data-testid="resend-email-input"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  variant="outline"
                  className="w-full border-[#D4AF37]/50 text-[#D4AF37] hover:bg-[#D4AF37]/10"
                  data-testid="resend-submit"
                >
                  {loading ? <CircleNotch size={18} className="animate-spin" /> : 'Renvoyer le lien'}
                </Button>
              </form>
            )}
          </div>

          <div className="mt-6">
            <Link to={`/${lang}/login`} className="text-[#A1A1AA] hover:text-[#D4AF37] text-sm transition-colors">
              Retour à la connexion
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default VerifyEmailPending;
