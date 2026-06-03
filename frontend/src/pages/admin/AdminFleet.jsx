import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Car, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
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

const emptyForm = { brand: '', model: '', plate: '', color: '', capacity: '' };

const AdminFleet = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchVehicles = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet`, { withCredentials: true });
      setVehicles(res.data);
    } catch (err) {
      console.error('Error fetching fleet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError('');
  };

  const openEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      plate: vehicle.plate || '',
      color: vehicle.color || '',
      capacity: vehicle.capacity ? String(vehicle.capacity) : '',
    });
    setIsEditOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/api/admin/fleet`, {
        brand: form.brand,
        model: form.model,
        plate: form.plate,
        color: form.color || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      }, { withCredentials: true });
      await fetchVehicles();
      setIsCreateOpen(false);
      resetForm();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/admin/fleet/${editingVehicle.id}`, {
        brand: form.brand || undefined,
        model: form.model || undefined,
        plate: form.plate || undefined,
        color: form.color || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
      }, { withCredentials: true });
      await fetchVehicles();
      setIsEditOpen(false);
      setEditingVehicle(null);
      resetForm();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Supprimer ce véhicule de la flotte ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/fleet/${vehicleId}`, { withCredentials: true });
      await fetchVehicles();
    } catch (err) {
      alert(parseError(err));
    }
  };

  const VehicleForm = ({ onSubmit, submitLabel }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-[#A1A1AA] text-sm">Marque *</Label>
          <Input
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            placeholder="Ex: Mercedes"
            required
            className="bg-[#1E1E1E] border-white/10 mt-1"
          />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-sm">Modèle *</Label>
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="Ex: Classe E"
            required
            className="bg-[#1E1E1E] border-white/10 mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-[#A1A1AA] text-sm">Immatriculation *</Label>
        <Input
          value={form.plate}
          onChange={(e) => setForm({ ...form, plate: e.target.value })}
          placeholder="Ex: AB-123-CD"
          required
          className="bg-[#1E1E1E] border-white/10 mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-[#A1A1AA] text-sm">Couleur</Label>
          <Input
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            placeholder="Ex: Noir"
            className="bg-[#1E1E1E] border-white/10 mt-1"
          />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-sm">Capacité (places)</Label>
          <Input
            type="number"
            min="1"
            max="20"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            placeholder="Ex: 4"
            className="bg-[#1E1E1E] border-white/10 mt-1"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={saving}
        className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold"
      >
        {saving ? 'Enregistrement...' : submitLabel}
      </Button>
    </form>
  );

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold font-['Cormorant_Garamond'] text-[#D4AF37]">Flotte Admin</h2>
          <p className="text-[#A1A1AA] text-sm mt-1">{vehicles.length} véhicule(s) dans la flotte</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
              <Plus size={18} className="mr-2" />
              Ajouter un véhicule
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-[#D4AF37] font-['Cormorant_Garamond'] text-xl">
                Nouveau véhicule
              </DialogTitle>
            </DialogHeader>
            <VehicleForm onSubmit={handleCreate} submitLabel="Ajouter" />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-12 text-[#A1A1AA]">
          <Car size={48} className="mx-auto mb-3 opacity-30" />
          <p>Aucun véhicule dans la flotte admin.</p>
          <p className="text-sm mt-1">Ajoutez vos véhicules pour pouvoir les affecter aux courses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/5 hover:border-[#D4AF37]/20 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center">
                    <Car size={20} className="text-[#D4AF37]" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      {vehicle.brand} {vehicle.model}
                    </p>
                    <p className="text-[#D4AF37] text-sm font-mono">{vehicle.plate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(vehicle)}
                    className="p-2 rounded-lg hover:bg-white/5 text-[#A1A1AA] hover:text-white transition-colors"
                    title="Modifier"
                  >
                    <PencilSimple size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(vehicle.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-[#A1A1AA] hover:text-red-400 transition-colors"
                    title="Supprimer"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-[#A1A1AA]">
                {vehicle.color && (
                  <span className="px-2 py-1 rounded-full bg-white/5">{vehicle.color}</span>
                )}
                {vehicle.capacity && (
                  <span className="px-2 py-1 rounded-full bg-white/5">{vehicle.capacity} places</span>
                )}
                <span className={`px-2 py-1 rounded-full ${vehicle.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {vehicle.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingVehicle(null); resetForm(); } }}>
        <DialogContent className="bg-[#141414] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37] font-['Cormorant_Garamond'] text-xl">
              Modifier le véhicule
            </DialogTitle>
          </DialogHeader>
          <VehicleForm onSubmit={handleEdit} submitLabel="Enregistrer" />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFleet;
