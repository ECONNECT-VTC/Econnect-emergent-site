import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CarSimple, Plus, Trash, Phone, Envelope, Car } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', vehicle_model: '', vehicle_plate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchDrivers(); }, []);

  const fetchDrivers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true });
      setDrivers(response.data);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  };

  const createDriver = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/admin/drivers`, formData, { withCredentials: true });
      setIsOpen(false);
      setFormData({ name: '', email: '', phone: '', password: '', vehicle_model: '', vehicle_plate: '' });
      fetchDrivers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur');
    } finally { setSubmitting(false); }
  };

  const deleteDriver = async (id) => {
    if (!window.confirm('Supprimer ce chauffeur ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/drivers/${id}`, { withCredentials: true });
      fetchDrivers();
    } catch (error) { console.error('Error:', error); }
  };

  return (
    <DashboardLayout title="Gestion des Chauffeurs">
      <div className="flex justify-between items-center mb-6">
        <p className="text-[#A1A1AA]">{drivers.length} chauffeur(s)</p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" data-testid="add-driver-btn"><Plus size={18} className="mr-2" />Ajouter</Button>
          </DialogTrigger>
          <DialogContent className="bg-[#141414] border-white/10">
            <DialogHeader><DialogTitle className="text-[#D4AF37]">Nouveau Chauffeur</DialogTitle></DialogHeader>
            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}
            <form onSubmit={createDriver} className="space-y-4">
              <div><Label className="text-[#A1A1AA]">Nom</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required className="bg-[#1E1E1E] border-white/10" /></div>
              <div><Label className="text-[#A1A1AA]">Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required className="bg-[#1E1E1E] border-white/10" /></div>
              <div><Label className="text-[#A1A1AA]">Telephone</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required className="bg-[#1E1E1E] border-white/10" /></div>
              <div><Label className="text-[#A1A1AA]">Mot de passe</Label><Input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required className="bg-[#1E1E1E] border-white/10" /></div>
              <div><Label className="text-[#A1A1AA]">Modele vehicule</Label><Input value={formData.vehicle_model} onChange={(e) => setFormData({...formData, vehicle_model: e.target.value})} required className="bg-[#1E1E1E] border-white/10" placeholder="Mercedes Classe E" /></div>
              <div><Label className="text-[#A1A1AA]">Immatriculation</Label><Input value={formData.vehicle_plate} onChange={(e) => setFormData({...formData, vehicle_plate: e.target.value})} required className="bg-[#1E1E1E] border-white/10" placeholder="AB-123-CD" /></div>
              <Button type="submit" disabled={submitting} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">{submitting ? 'Creation...' : 'Creer'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div> : drivers.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center"><CarSimple size={48} className="text-[#A1A1AA] mx-auto mb-4" /><p className="text-[#A1A1AA]">Aucun chauffeur</p></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="drivers-list">
          {drivers.map((driver) => (
            <div key={driver.id} className="glass rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{driver.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${driver.is_available ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {driver.is_available ? 'Disponible' : 'Indisponible'}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteDriver(driver.id)} className="text-red-400 hover:bg-red-500/10"><Trash size={18} /></Button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[#A1A1AA]"><Envelope size={16} />{driver.email}</div>
                <div className="flex items-center gap-2 text-[#A1A1AA]"><Phone size={16} />{driver.phone}</div>
                <div className="flex items-center gap-2 text-[#D4AF37]"><Car size={16} />{driver.vehicle_model} - {driver.vehicle_plate}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminDrivers;
