import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Car, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import API_URL from '@/config';

const CATEGORY_IMAGES = {
  Berline: '/photo/chr.png',
  Green: '/photo/classe_c.png',
  Luxe: '/photo/range_rover.png',
  Van: '/photo/classe_v.png',
};

const CATEGORY_DISPLAY_NAMES = {
  Berline: 'Confort Classique',
  Green: 'Confort Premium',
  Luxe: 'Prestige',
  Van: 'Van',
};

const DISPOSITION_DURATIONS = [1, 2, 3, 4, 6, 8, 10, 12];

const AdminPricing = () => {
  const [activeTab, setActiveTab] = useState('categories');

  // --- Tab 1: Vehicle categories ---
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_per_km: '',
    min_fare: '',
    image_url: '',
    order: 0
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // --- Tab 2: Mise à disposition ---
  const [dispRates, setDispRates] = useState([]);
  const [dispLoading, setDispLoading] = useState(false);
  const [dispDialogOpen, setDispDialogOpen] = useState(false);
  const [dispDialogCategory, setDispDialogCategory] = useState('');
  const [dispForm, setDispForm] = useState({ duration_hours: '1', price: '' });
  const [dispEditId, setDispEditId] = useState(null);
  const [dispSubmitting, setDispSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchDispRates();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/vehicle-categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDispRates = async () => {
    setDispLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/disposition-rates`, { withCredentials: true });
      setDispRates(response.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setDispLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', price_per_km: '', min_fare: '', image_url: '', order: categories.length });
    setError('');
    setIsOpen(true);
  };

  const openEditDialog = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description,
      price_per_km: category.price_per_km.toString(),
      min_fare: category.min_fare.toString(),
      image_url: category.image_url || '',
      order: category.order
    });
    setError('');
    setIsOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const payload = {
      name: formData.name,
      description: formData.description,
      price_per_km: parseFloat(formData.price_per_km),
      min_fare: parseFloat(formData.min_fare),
      image_url: formData.image_url || null,
      order: parseInt(formData.order)
    };

    try {
      if (editingCategory) {
        await axios.put(
          `${API_URL}/api/admin/vehicle-categories/${editingCategory.id}`,
          payload,
          { withCredentials: true }
        );
      } else {
        await axios.post(`${API_URL}/api/admin/vehicle-categories`, payload, { withCredentials: true });
      }
      setIsOpen(false);
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (category) => {
    try {
      await axios.put(
        `${API_URL}/api/admin/vehicle-categories/${category.id}`,
        { is_active: !category.is_active },
        { withCredentials: true }
      );
      fetchCategories();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/vehicle-categories/${id}`, { withCredentials: true });
      fetchCategories();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const openDispDialog = (categoryName, rate = null) => {
    setDispDialogCategory(categoryName);
    if (rate) {
      setDispEditId(rate.id);
      setDispForm({ duration_hours: String(rate.duration_hours), price: String(rate.price) });
    } else {
      setDispEditId(null);
      setDispForm({ duration_hours: '1', price: '' });
    }
    setDispDialogOpen(true);
  };

  const handleDispSubmit = async () => {
    setDispSubmitting(true);
    try {
      const payload = {
        vehicle_category_name: dispDialogCategory,
        duration_hours: parseFloat(dispForm.duration_hours),
        price: parseFloat(dispForm.price),
        is_active: true,
      };
      if (dispEditId) {
        await axios.put(`${API_URL}/api/admin/disposition-rates/${dispEditId}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API_URL}/api/admin/disposition-rates`, payload, { withCredentials: true });
      }
      setDispDialogOpen(false);
      fetchDispRates();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setDispSubmitting(false);
    }
  };

  const deleteDispRate = async (id) => {
    if (!window.confirm('Supprimer ce tarif ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/disposition-rates/${id}`, { withCredentials: true });
      fetchDispRates();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const DISP_CATEGORIES = ['Berline', 'Green', 'Luxe', 'Van'];

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {/* Tab buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'categories' ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}`}
        >
          🚗 Gammes de véhicules
        </button>
        <button
          onClick={() => setActiveTab('disposition')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'disposition' ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}`}
        >
          ⏱️ Mise à Disposition
        </button>
      </div>

      {/* Tab 1: Vehicle categories */}
      {activeTab === 'categories' && (
        <>
          <div className="flex justify-between items-center mb-6">
            <p className="text-[#A1A1AA]">{categories.length} catégorie(s) de véhicules</p>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={openCreateDialog}
                  className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                  data-testid="add-category-btn"
                >
                  <Plus size={18} className="mr-2" />Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#141414] border-white/10 max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[#D4AF37]">
                    {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                  </DialogTitle>
                </DialogHeader>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className="text-[#A1A1AA]">Nom</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="bg-[#1E1E1E] border-white/10"
                      placeholder="Ex: Berline, Van, Luxe"
                    />
                  </div>
                  <div>
                    <Label className="text-[#A1A1AA]">Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                      className="bg-[#1E1E1E] border-white/10"
                      placeholder="Description de la gamme..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[#A1A1AA]">Prix par km (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price_per_km}
                        onChange={(e) => setFormData({ ...formData, price_per_km: e.target.value })}
                        required
                        className="bg-[#1E1E1E] border-white/10"
                        placeholder="2.50"
                      />
                    </div>
                    <div>
                      <Label className="text-[#A1A1AA]">Tarif minimum (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.min_fare}
                        onChange={(e) => setFormData({ ...formData, min_fare: e.target.value })}
                        required
                        className="bg-[#1E1E1E] border-white/10"
                        placeholder="25.00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[#A1A1AA]">URL Image (optionnel)</Label>
                    <Input
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      className="bg-[#1E1E1E] border-white/10"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label className="text-[#A1A1AA]">Ordre d'affichage</Label>
                    <Input
                      type="number"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                      className="bg-[#1E1E1E] border-white/10"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                  >
                    {submitting ? 'Enregistrement...' : editingCategory ? 'Modifier' : 'Créer'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
          ) : categories.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <Car size={48} className="text-[#A1A1AA] mx-auto mb-4" />
              <p className="text-[#A1A1AA]">Aucune catégorie</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="categories-list">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className={`glass rounded-xl overflow-hidden ${!category.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="h-48 overflow-hidden">
                    <img
                      src={CATEGORY_IMAGES[category.name] || category.image_url || '/photo/chr.png'}
                      alt={CATEGORY_DISPLAY_NAMES[category.name] || category.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-xl">{CATEGORY_DISPLAY_NAMES[category.name] || category.name}</h3>
                        <p className="text-sm text-[#A1A1AA] mt-1">{category.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={category.is_active}
                          onCheckedChange={() => toggleActive(category)}
                          className="data-[state=checked]:bg-green-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-[#1E1E1E] rounded-lg p-3">
                        <p className="text-xs text-[#A1A1AA] uppercase mb-1">Prix / km</p>
                        <p className="text-lg font-bold text-[#D4AF37]">{category.price_per_km.toFixed(2)}€</p>
                      </div>
                      <div className="bg-[#1E1E1E] rounded-lg p-3">
                        <p className="text-xs text-[#A1A1AA] uppercase mb-1">Tarif min.</p>
                        <p className="text-lg font-bold text-[#D4AF37]">{category.min_fare.toFixed(2)}€</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(category)}
                        className="flex-1 border-white/10 hover:bg-white/10"
                      >
                        <PencilSimple size={16} className="mr-2" />Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCategory(category.id)}
                        className="text-red-400 hover:bg-red-500/10"
                      >
                        <Trash size={18} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Mise à disposition */}
      {activeTab === 'disposition' && (
        <div>
          {dispLoading ? (
            <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {DISP_CATEGORIES.map((catName) => {
                const rates = dispRates.filter((r) => r.vehicle_category_name === catName).sort((a, b) => a.duration_hours - b.duration_hours);
                return (
                  <div key={catName} className="glass rounded-xl overflow-hidden">
                    <div className="h-36 overflow-hidden">
                      <img src={CATEGORY_IMAGES[catName]} alt={catName} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg mb-3">{CATEGORY_DISPLAY_NAMES[catName]}</h3>
                      {rates.length === 0 ? (
                        <p className="text-xs text-[#A1A1AA] mb-3">Aucun tarif</p>
                      ) : (
                        <table className="w-full text-sm mb-3">
                          <thead>
                            <tr className="text-[#A1A1AA] text-xs">
                              <th className="text-left pb-1">Durée</th>
                              <th className="text-left pb-1">Prix</th>
                              <th className="pb-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rates.map((rate) => (
                              <tr key={rate.id} className="border-t border-white/5">
                                <td className="py-1">{rate.duration_hours}h</td>
                                <td className="py-1 text-[#D4AF37]">{rate.price.toFixed(2)} €</td>
                                <td className="py-1 flex gap-1 justify-end">
                                  <button onClick={() => openDispDialog(catName, rate)} className="text-[#D4AF37] hover:text-[#F0C74A] p-1">
                                    <PencilSimple size={14} />
                                  </button>
                                  <button onClick={() => deleteDispRate(rate.id)} className="text-red-400 hover:text-red-300 p-1">
                                    <Trash size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <Button
                        size="sm"
                        onClick={() => openDispDialog(catName)}
                        className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                      >
                        <Plus size={14} className="mr-1" />Ajouter un tarif
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dialog: Add/Edit disposition rate */}
      <Dialog open={dispDialogOpen} onOpenChange={setDispDialogOpen}>
        <DialogContent className="bg-[#141414] border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">
              {dispEditId ? 'Modifier le tarif' : 'Ajouter un tarif'} — {CATEGORY_DISPLAY_NAMES[dispDialogCategory] || dispDialogCategory}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-[#A1A1AA]">Durée (heures)</Label>
              <Select value={String(dispForm.duration_hours)} onValueChange={(v) => setDispForm({ ...dispForm, duration_hours: v })}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  {DISPOSITION_DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}h</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[#A1A1AA]">Prix (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={dispForm.price}
                onChange={(e) => setDispForm({ ...dispForm, price: e.target.value })}
                className="bg-[#1E1E1E] border-white/10 mt-1"
                placeholder="Ex: 120.00"
              />
            </div>
            <Button
              onClick={handleDispSubmit}
              disabled={dispSubmitting || !dispForm.price}
              className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
            >
              {dispSubmitting ? 'Enregistrement...' : dispEditId ? 'Modifier' : 'Ajouter'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPricing;

