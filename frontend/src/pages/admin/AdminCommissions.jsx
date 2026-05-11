import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const defaultForm = {
  commission_rate: 0.1,
  tva_client_rate: 0.1,
  tva_commission_rate: 0.2,
  company_name: 'Econnect VTC',
  company_address: 'À compléter',
  company_phone: 'À compléter',
  company_email: 'À compléter',
  company_siret: 'À compléter',
  company_vtc_number: 'À compléter'
};

const toPercentValue = (value) => Number(value || 0) * 100;
const fromPercentValue = (value) => Number(value || 0) / 100;

const AdminCommissions = () => {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/financial/commissions`, { withCredentials: true });
        setForm(response.data);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const preview = useMemo(() => {
    const priceTtc = 60;
    const commissionTtc = priceTtc * Number(form.commission_rate || 0);
    const driverEarning = priceTtc - commissionTtc;
    const clientHt = priceTtc / (1 + Number(form.tva_client_rate || 0));
    const clientTva = priceTtc - clientHt;
    const commissionHt = commissionTtc / (1 + Number(form.tva_commission_rate || 0));
    const commissionTva = commissionTtc - commissionHt;

    return {
      priceTtc,
      clientHt,
      clientTva,
      commissionTtc,
      commissionHt,
      commissionTva,
      driverEarning
    };
  }, [form]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        commission_rate: Number(form.commission_rate),
        tva_client_rate: Number(form.tva_client_rate),
        tva_commission_rate: Number(form.tva_commission_rate)
      };
      const response = await axios.put(`${API_URL}/api/admin/financial/commissions`, payload, { withCredentials: true });
      setForm(response.data);
      alert('Paramètres enregistrés');
    } catch (error) {
      console.error('Error:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>;
  }

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full grid lg:grid-cols-2 gap-6">
      <div className="bg-[#141414] rounded-xl border border-white/10 p-6 space-y-4">
        <h2 className="text-xl font-semibold">Paramètres de commissions</h2>

        <label className="block text-sm text-[#A1A1AA]">Taux de commission (%)</label>
        <input
          type="number"
          className="w-full bg-[#0A0A0A] border border-white/10 rounded px-3 py-2"
          value={toPercentValue(form.commission_rate)}
          onChange={(e) => handleChange('commission_rate', fromPercentValue(e.target.value))}
        />

        <label className="block text-sm text-[#A1A1AA]">TVA Client (%)</label>
        <input
          type="number"
          className="w-full bg-[#0A0A0A] border border-white/10 rounded px-3 py-2"
          value={toPercentValue(form.tva_client_rate)}
          onChange={(e) => handleChange('tva_client_rate', fromPercentValue(e.target.value))}
        />

        <label className="block text-sm text-[#A1A1AA]">TVA Commission (%)</label>
        <input
          type="number"
          className="w-full bg-[#0A0A0A] border border-white/10 rounded px-3 py-2"
          value={toPercentValue(form.tva_commission_rate)}
          onChange={(e) => handleChange('tva_commission_rate', fromPercentValue(e.target.value))}
        />

        {[
          ['company_name', 'Nom entreprise'],
          ['company_address', 'Adresse'],
          ['company_phone', 'Téléphone'],
          ['company_email', 'Email'],
          ['company_siret', 'SIRET'],
          ['company_vtc_number', 'Numéro VTC']
        ].map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm text-[#A1A1AA]">{label}</label>
            <input
              className="w-full bg-[#0A0A0A] border border-white/10 rounded px-3 py-2"
              value={form[key] || ''}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-2 px-4 py-2 rounded bg-[#D4AF37] text-[#0A0A0A] font-semibold"
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>

      <div className="bg-[#141414] rounded-xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold mb-4">Aperçu dynamique (course à 60€ TTC)</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-[#A1A1AA]">Prix client TTC</span><span>{preview.priceTtc.toFixed(2)}€</span></div>
          <div className="flex justify-between"><span className="text-[#A1A1AA]">HT client</span><span>{preview.clientHt.toFixed(2)}€</span></div>
          <div className="flex justify-between"><span className="text-[#A1A1AA]">TVA client</span><span>{preview.clientTva.toFixed(2)}€</span></div>
          <div className="flex justify-between"><span className="text-[#A1A1AA]">Commission TTC</span><span>{preview.commissionTtc.toFixed(2)}€</span></div>
          <div className="flex justify-between"><span className="text-[#A1A1AA]">Commission HT</span><span>{preview.commissionHt.toFixed(2)}€</span></div>
          <div className="flex justify-between"><span className="text-[#A1A1AA]">TVA commission</span><span>{preview.commissionTva.toFixed(2)}€</span></div>
          <div className="flex justify-between text-green-400 font-semibold"><span>Gain chauffeur</span><span>{preview.driverEarning.toFixed(2)}€</span></div>
        </div>
      </div>
    </div>
  );
};

export default AdminCommissions;
