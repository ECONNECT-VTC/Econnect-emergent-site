import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CarSimple, Plus, Trash } from '@phosphor-icons/react';
import API_URL from '@/config';

const parseError = (err) => {
  const detail = err.response?.data?.detail;
  if (!detail) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || 'champ'}: ${e.msg}`).join(' | ');
  }
  return 'Erreur inconnue';
};

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    vehicle_model: '',
    vehicle_plate: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/drivers`, { withCredentials: true });
      setDrivers(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
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
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDriver = async (id) => {
    if (!window.confirm('Supprimer ce chauffeur ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/drivers/${id}`, { withCredentials: true });
      fetchDrivers();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const filteredDrivers = drivers.filter((driver) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (
      driver.name?.toLowerCase().includes(term) ||
      driver.email?.toLowerCase().includes(term) ||
      driver.phone?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="flex justify-between items-center mb-6">
        <p className="text-[#A1A1AA]">{drivers.length} chauffeur(s)</p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
              data-testid="add-driver-btn"
            >
              <Plus size={18} className="mr-2" />Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#141414] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-[#D4AF37]">Nouveau Chauffeur</DialogTitle>
            </DialogHeader>
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
            <form onSubmit={createDriver} className="space-y-4">
              <div>
                <Label className="text-[#A1A1AA]">Nom</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Téléphone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Mot de passe</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Modèle véhicule</Label>
                <Input
                  value={formData.vehicle_model}
                  onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Immatriculation</Label>
                <Input
                  value={formData.vehicle_plate}
                  onChange={(e) => setFormData({ ...formData, vehicle_plate: e.target.value })}
                  required
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
              >
                {submitting ? 'Création...' : 'Créer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Rechercher par nom, email ou téléphone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#1E1E1E] border-white/10 max-w-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
      ) : drivers.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <CarSimple size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucun chauffeur</p>
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <CarSimple size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucun résultat pour « {search} »</p>
        </div>
      ) : (
        <div className="glass rounded-xl p-4 overflow-x-auto" data-testid="drivers-list">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-[#A1A1AA] border-b border-white/10">
                <th className="py-3">Nom</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Véhicule</th>
                <th>Immatriculation</th>
                <th>Disponibilité</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => (
                <tr key={driver.id} className="border-b border-white/5">
                  <td className="py-3 font-medium">{driver.name}</td>
                  <td>{driver.email}</td>
                  <td>{driver.phone}</td>
                  <td>{driver.vehicle_model}</td>
                  <td>{driver.vehicle_plate}</td>
                  <td>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        driver.is_available
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {driver.is_available ? 'Disponible' : 'Indisponible'}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDriver(driver.id)}
                      className="text-red-400 hover:bg-red-500/10"
                    >
                      <Trash size={18} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminDrivers;
