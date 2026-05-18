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
  Van: '/photo/classe_v.png'
};

const CATEGORY_DISPLAY_NAMES = {
  Berline: 'Confort Classique',
  Green: 'Confort Premium',
  Luxe: 'Prestige',
  Van: 'Van'
};

const DISPOSITION_DURATIONS = [1, 2, 3, 4, 6, 8, 10, 12];
const CATEGORY_ORDER = ['Berline', 'Green', 'Luxe', 'Van'];

const AdminPricing = () => {
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [dispositionRates, setDispositionRates] = useState([]);
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

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [rateForm, setRateForm] = useState({
    vehicle_category_name: 'Berline',
    duration_hours: '1',
    price: '',
    is_active: true
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [categoriesRes, ratesRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/vehicle-categories`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/disposition-rates`, { withCredentials: true })
      ]);
      setCategories(categoriesRes.data);
      setDispositionRates(ratesRes.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    } finally {
      setLoading(false);
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
      order: parseInt(formData.order, 10)
    };

    try {
      if (editingCategory) {
        await axios.put(`${API_URL}/api/admin/vehicle-categories/${editingCategory.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API_URL}/api/admin/vehicle-categories`, payload, { withCredentials: true });
      }
      setIsOpen(false);
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
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
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/vehicle-categories/${id}`, { withCredentials: true });
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    }
  };

  const openCreateRateDialog = (vehicleCategoryName) => {
    setEditingRate(null);
    setRateForm({
      vehicle_category_name: vehicleCategoryName || 'Berline',
      duration_hours: '1',
      price: '',
      is_active: true
    });
    setRateDialogOpen(true);
  };

  const openEditRateDialog = (rate) => {
    setEditingRate(rate);
    setRateForm({
      vehicle_category_name: rate.vehicle_category_name,
      duration_hours: String(rate.duration_hours),
      price: String(rate.price),
      is_active: rate.is_active !== false
    });
    setRateDialogOpen(true);
  };

  const submitRate = async () => {
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        vehicle_category_name: rateForm.vehicle_category_name,
        duration_hours: Number(rateForm.duration_hours),
        price: Number(rateForm.price),
        is_active: rateForm.is_active
      };
      if (editingRate) {
        await axios.put(`${API_URL}/api/admin/disposition-rates/${editingRate.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API_URL}/api/admin/disposition-rates`, payload, { withCredentials: true });
      }
      setRateDialogOpen(false);
      setEditingRate(null);
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRate = async (rateId) => {
    if (!window.confirm('Supprimer ce tarif de mise à disposition ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/disposition-rates/${rateId}`, { withCredentials: true });
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    }
  };

  const toggleRateActive = async (rate) => {
    try {
      await axios.put(
        `${API_URL}/api/admin/disposition-rates/${rate.id}`,
        { is_active: !rate.is_active },
        { withCredentials: true }
      );
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur');
    }
  };

  const getRatesByCategory = (categoryName) => dispositionRates
    .filter((rate) => rate.vehicle_category_name === categoryName)
    .sort((a, b) => a.duration_hours - b.duration_hours);

  const sortedCategories = [...categories].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a.name);
    const bIndex = CATEGORY_ORDER.indexOf(b.name);
    if (aIndex === -1 && bIndex === -1) return (a.order ?? 0) - (b.order ?? 0);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const dispositionCategoryNames = CATEGORY_ORDER.filter((name) => sortedCategories.some((category) => category.name === name));

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          onClick={() => setActiveTab('categories')}
          className={activeTab === 'categories' ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}
        >
          🚗 Gammes de véhicules
        </Button>
        <Button
          onClick={() => setActiveTab('disposition')}
          className={activeTab === 'disposition' ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'}
        >
          ⏱️ Mise à Disposition
        </Button>
      </div>

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
                  <Button type="submit" disabled={submitting} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
                    {submitting ? 'Enregistrement...' : editingCategory ? 'Modifier' : 'Créer'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
          ) : sortedCategories.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <Car size={48} className="text-[#A1A1AA] mx-auto mb-4" />
              <p className="text-[#A1A1AA]">Aucune catégorie</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="categories-list">
              {sortedCategories.map((category) => (
                <div key={category.id} className={`glass rounded-xl overflow-hidden ${!category.is_active ? 'opacity-60' : ''}`}>
                  <div className="h-48 overflow-hidden bg-[#141414]">
                    <img
                      src={CATEGORY_IMAGES[category.name] || category.image_url}
                      alt={category.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-xl">{CATEGORY_DISPLAY_NAMES[category.name] || category.name}</h3>
                        <p className="text-sm text-[#A1A1AA] mt-1">{category.description}</p>
                      </div>
                      <Switch
                        checked={category.is_active}
                        onCheckedChange={() => toggleActive(category)}
                        className="data-[state=checked]:bg-green-500"
                      />
                    </div>

                    <div className="grid gap-3 mb-4">
                      <div className="bg-[#1E1E1E] rounded-lg p-3">
                        <p className="text-xs text-[#A1A1AA] uppercase mb-1">Prix / km</p>
                        <p className="text-xl font-bold text-[#D4AF37]">{category.price_per_km.toFixed(2)}€</p>
                      </div>
                      <div className="bg-[#1E1E1E] rounded-lg p-3">
                        <p className="text-xs text-[#A1A1AA] uppercase mb-1">Tarif minimum</p>
                        <p className="text-xl font-bold text-[#D4AF37]">{category.min_fare.toFixed(2)}€</p>
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

      {activeTab === 'disposition' && (
        <>
          <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
            <div className="space-y-4">
              {dispositionCategoryNames.map((categoryName) => {
                const rates = getRatesByCategory(categoryName);
                return (
                  <div key={categoryName} className="glass rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <img src={CATEGORY_IMAGES[categoryName]} alt={categoryName} className="w-20 h-14 rounded object-cover" />
                      <h3 className="text-xl font-bold">{CATEGORY_DISPLAY_NAMES[categoryName] || categoryName}</h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[#A1A1AA] border-b border-white/10">
                            <th className="py-2">Durée</th>
                            <th className="py-2">Prix</th>
                            <th className="py-2">Actif</th>
                            <th className="py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rates.map((rate) => (
                            <tr key={rate.id} className="border-b border-white/5">
                              <td className="py-2">{rate.duration_hours}h</td>
                              <td className="py-2">{Number(rate.price).toFixed(2)}€</td>
                              <td className="py-2">
                                <Switch
                                  checked={rate.is_active}
                                  onCheckedChange={() => toggleRateActive(rate)}
                                  className="data-[state=checked]:bg-green-500"
                                />
                              </td>
                              <td className="py-2">
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10"
                                    onClick={() => openEditRateDialog(rate)}
                                  >
                                    ✏️
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                                    onClick={() => deleteRate(rate.id)}
                                  >
                                    🗑️
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {rates.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-3 text-[#A1A1AA]">Aucun tarif défini</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <Button
                      onClick={() => openCreateRateDialog(categoryName)}
                      className="mt-4 bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                    >
                      <Plus size={16} className="mr-2" />Ajouter un tarif
                    </Button>
                  </div>
                );
              })}
            </div>

            <DialogContent className="bg-[#141414] border-white/10 max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-[#D4AF37]">
                  {editingRate ? 'Modifier un tarif de mise à disposition' : 'Ajouter un tarif de mise à disposition'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-[#A1A1AA]">Gamme de véhicule</Label>
                  <Select
                    value={rateForm.vehicle_category_name}
                    onValueChange={(value) => setRateForm((prev) => ({ ...prev, vehicle_category_name: value }))}
                  >
                    <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1E1E1E] border-white/10">
                      {CATEGORY_ORDER.map((name) => (
                        <SelectItem key={name} value={name}>{CATEGORY_DISPLAY_NAMES[name] || name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[#A1A1AA]">Durée</Label>
                  <Select
                    value={rateForm.duration_hours}
                    onValueChange={(value) => setRateForm((prev) => ({ ...prev, duration_hours: value }))}
                  >
                    <SelectTrigger className="bg-[#1E1E1E] border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1E1E1E] border-white/10">
                      {DISPOSITION_DURATIONS.map((hours) => (
                        <SelectItem key={hours} value={String(hours)}>{hours}h</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[#A1A1AA]">Tarif (€)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateForm.price}
                    onChange={(e) => setRateForm((prev) => ({ ...prev, price: e.target.value }))}
                    className="bg-[#1E1E1E] border-white/10"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[#A1A1AA]">Actif</Label>
                  <Switch
                    checked={rateForm.is_active}
                    onCheckedChange={(checked) => setRateForm((prev) => ({ ...prev, is_active: checked }))}
                    className="data-[state=checked]:bg-green-500"
                  />
                </div>
                <Button
                  onClick={submitRate}
                  disabled={submitting || !rateForm.price}
                  className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                >
                  {submitting ? 'Enregistrement...' : editingRate ? 'Modifier le tarif' : 'Ajouter le tarif'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default AdminPricing;
