import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CircleNotch, Envelope } from '@phosphor-icons/react';
import API_URL from '@/config';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { lang = 'fr' } = useParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
      setSubmitted(true);
    } catch (err) {
      // Always show success message to avoid email enumeration
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6" data-testid="forgot-password-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-2xl p-8">
          {/* Back link */}
          <Link to={`/${lang}/login`} className="inline-flex items-center text-[#A1A1AA] hover:text-[#D4AF37] mb-8 transition-colors">
            <ArrowLeft size={20} className="mr-2" />
            Retour à la connexion
          </Link>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-['Cormorant_Garamond'] gold-text mb-2">
              Mot de passe oublié ?
            </h1>
            <p className="text-[#A1A1AA]">
              Entrez votre email pour recevoir un lien de réinitialisation
            </p>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
              data-testid="forgot-password-success"
            >
              <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/50 text-[#D4AF37] px-4 py-4 rounded-lg">
                <p className="font-semibold mb-1">Email envoyé !</p>
                <p className="text-sm text-[#A1A1AA]">
                  Si cette adresse email est associée à un compte, vous recevrez un lien de
                  réinitialisation dans quelques minutes.
                </p>
              </div>
              <Link
                to={`/${lang}/login`}
                className="inline-block mt-4 text-[#D4AF37] hover:text-[#F0C74A] text-sm transition-colors"
              >
                Retour à la connexion
              </Link>
            </motion.div>
          ) : (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#A1A1AA]">Email</Label>
                  <div className="relative">
                    <Envelope size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      required
                      className="pl-10 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                      data-testid="forgot-password-email"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6"
                  data-testid="forgot-password-submit"
                >
                  {loading ? (
                    <CircleNotch size={20} className="animate-spin" />
                  ) : (
                    'Envoyer le lien de réinitialisation'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
