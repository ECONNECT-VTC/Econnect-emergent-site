import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const VEHICLE_CATEGORIES = ['Berline', 'Green', 'Luxe', 'Van'];
const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8, 10, 12];

const AdminPricing = () => {
  const [activeTab, setActiveTab] = useState('categories');

  // Categories
  const [categories, setCategories] = useState([]);
  const [loadingCat, setLoadingCat] = useState(true);
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

  // Mise à disposition
  const [dispRates, setDispRates] = useState([]);
  const [loadingDisp, setLoadingDisp] = useState(true);
  const [dispDialogOpen, setDispDialogOpen] = useState(false);
  const [editingDispRate, setEditingDispRate] = useState(null);
  const [dispForm, setDispForm] = useState({
    vehicle_category_name: 'Berline',
    duration_hours: '',
    price: '',
    is_active: true,
  });
  const [dispSubmitting, setDispSubmitting] = useState(false);
  const [dispError, setDispError] = useState('');

  useEffect(() => {
    fetchCategories();
    fetchDispRates();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/vehicle-categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoadingCat(false);
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
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/vehicle-categories/${id}`, { withCredentials: true });
      fetchCategories();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const fetchDispRates = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/disposition-rates`, { withCredentials: true });
      setDispRates(res.data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoadingDisp(false);
    }
  };

  const openAddDispRate = (categoryName) => {
    setEditingDispRate(null);
    setDispForm({ vehicle_category_name: categoryName, duration_hours: '', price: '', is_active: true });
    setDispError('');
    setDispDialogOpen(true);
  };

  const openEditDispRate = (rate) => {
    setEditingDispRate(rate);
    setDispForm({
      vehicle_category_name: rate.vehicle_category_name,
      duration_hours: rate.duration_hours.toString(),
      price: rate.price.toString(),
      is_active: rate.is_active,
    });
    setDispError('');
    setDispDialogOpen(true);
  };

  const handleDispSubmit = async (e) => {
    e.preventDefault();
    setDispError('');
    setDispSubmitting(true);
    const payload = {
      vehicle_category_name: dispForm.vehicle_category_name,
      duration_hours: parseFloat(dispForm.duration_hours),
      price: parseFloat(dispForm.price),
      is_active: dispForm.is_active,
    };
    try {
      if (editingDispRate) {
        await axios.put(`${API_URL}/api/admin/disposition-rates/${editingDispRate.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API_URL}/api/admin/disposition-rates`, payload, { withCredentials: true });
      }
      setDispDialogOpen(false);
      fetchDispRates();
    } catch (err) {
      setDispError(err.response?.data?.detail || 'Erreur');
    } finally {
      setDispSubmitting(false);
    }
  };

  const deleteDispRate = async (id) => {
    if (!window.confirm('Supprimer ce tarif ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/disposition-rates/${id}`, { withCredentials: true });
      fetchDispRates();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'categories'
              ? 'bg-[#D4AF37] text-[#0A0A0A]'
              : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'
          }`}
        >
          🚗 Gammes de véhicules
        </button>
        <button
          onClick={() => setActiveTab('disposition')}
          className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'disposition'
              ? 'bg-[#D4AF37] text-[#0A0A0A]'
              : 'bg-[#1E1E1E] text-[#A1A1AA] hover:bg-white/10'
          }`}
        >
          ⏱️ Mise à Disposition
        </button>
      </div>

      {/* Onglet Gammes */}
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
                    <div className="flex gap-2 flex-wrap mb-1 mt-1">
                      {VEHICLE_CATEGORIES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setFormData({ ...formData, name })}
                          className={`px-3 py-1 rounded text-xs border transition-all ${
                            formData.name === name
                              ? 'bg-[#D4AF37] text-[#0A0A0A] border-[#D4AF37]'
                              : 'bg-[#1E1E1E] text-[#A1A1AA] border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {CATEGORY_DISPLAY_NAMES[name] || name}
                        </button>
                      ))}
                    </div>
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

          {loadingCat ? (
            <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
          ) : categories.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <Car size={48} className="text-[#A1A1AA] mx-auto mb-4" />
              <p className="text-[#A1A1AA]">Aucune catégorie</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="categories-list">
              {categories.map((category) => {
                const imgSrc = CATEGORY_IMAGES[category.name] || category.image_url;
                const displayName = CATEGORY_DISPLAY_NAMES[category.name] || category.name;
                return (
                  <div
                    key={category.id}
                    className={`glass rounded-xl overflow-hidden ${!category.is_active ? 'opacity-60' : ''}`}
                  >
                    {imgSrc && (
                      <div className="h-48 overflow-hidden">
                        <img src={imgSrc} alt={displayName} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{displayName}</h3>
                          <p className="text-xs text-[#A1A1AA] mt-1 line-clamp-2">{category.description}</p>
                        </div>
                        <Switch
                          checked={category.is_active}
                          onCheckedChange={() => toggleActive(category)}
                          className="data-[state=checked]:bg-green-500 shrink-0 ml-2"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-[#1E1E1E] rounded-lg p-3">
                          <p className="text-xs text-[#A1A1AA] uppercase mb-1">Prix / km</p>
                          <p className="text-xl font-bold text-[#D4AF37]">{category.price_per_km.toFixed(2)}€</p>
                        </div>
                        <div className="bg-[#1E1E1E] rounded-lg p-3">
                          <p className="text-xs text-[#A1A1AA] uppercase mb-1">Min</p>
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
                          <PencilSimple size={16} className="mr-1" />Modifier
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
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Onglet Mise à Disposition */}
      {activeTab === 'disposition' && (
        <>
          <div className="mb-6">
            <p className="text-[#A1A1AA] text-sm">
              Définissez les tarifs de mise à disposition par gamme et par durée (en heures).
            </p>
          </div>

          {loadingDisp ? (
            <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {VEHICLE_CATEGORIES.map((catName) => {
                const rates = dispRates
                  .filter((r) => r.vehicle_category_name === catName)
                  .sort((a, b) => a.duration_hours - b.duration_hours);
                return (
                  <div key={catName} className="glass rounded-xl overflow-hidden">
                    <div className="h-36 overflow-hidden">
                      <img
                        src={CATEGORY_IMAGES[catName]}
                        alt={CATEGORY_DISPLAY_NAMES[catName]}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg mb-1">{CATEGORY_DISPLAY_NAMES[catName]}</h3>
                      <p className="text-xs text-[#A1A1AA] mb-4">{catName}</p>

                      {rates.length === 0 ? (
                        <p className="text-xs text-[#525252] mb-3">Aucun tarif défini</p>
                      ) : (
                        <table className="w-full text-sm mb-3">
                          <thead>
                            <tr className="text-xs text-[#A1A1AA] border-b border-white/10">
                              <th className="text-left py-1">Durée</th>
                              <th className="text-right py-1">Tarif</th>
                              <th className="text-right py-1">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rates.map((rate) => (
                              <tr key={rate.id} className={`border-b border-white/5 ${!rate.is_active ? 'opacity-50' : ''}`}>
                                <td className="py-2">{rate.duration_hours}h</td>
                                <td className="text-right font-medium text-[#D4AF37]">
                                  {rate.price.toFixed(0)}€
                                </td>
                                <td className="text-right py-1">
                                  <button
                                    onClick={() => openEditDispRate(rate)}
                                    className="text-[#A1A1AA] hover:text-[#D4AF37] mr-2"
                                    title="Modifier"
                                  >
                                    <PencilSimple size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteDispRate(rate.id)}
                                    className="text-red-400 hover:text-red-300"
                                    title="Supprimer"
                                  >
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
                        onClick={() => openAddDispRate(catName)}
                        className="w-full bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/30"
                        variant="outline"
                      >
                        <Plus size={14} className="mr-1" />Ajouter un tarif
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Dialog open={dispDialogOpen} onOpenChange={setDispDialogOpen}>
            <DialogContent className="bg-[#141414] border-white/10 max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-[#D4AF37]">
                  {editingDispRate ? 'Modifier le tarif' : 'Ajouter un tarif'}
                </DialogTitle>
              </DialogHeader>
              {dispError && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">
                  {dispError}
                </div>
              )}
              <form onSubmit={handleDispSubmit} className="space-y-4">
                <div>
                  <Label className="text-[#A1A1AA]">Gamme</Label>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {VEHICLE_CATEGORIES.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setDispForm({ ...dispForm, vehicle_category_name: name })}
                        className={`px-3 py-1 rounded text-xs border transition-all ${
                          dispForm.vehicle_category_name === name
                            ? 'bg-[#D4AF37] text-[#0A0A0A] border-[#D4AF37]'
                            : 'bg-[#1E1E1E] text-[#A1A1AA] border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {CATEGORY_DISPLAY_NAMES[name]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[#A1A1AA]">Durée (heures)</Label>
                  <div className="flex gap-1 flex-wrap mt-1 mb-1">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDispForm({ ...dispForm, duration_hours: d.toString() })}
                        className={`px-2 py-1 rounded text-xs border transition-all ${
                          dispForm.duration_hours === d.toString()
                            ? 'bg-[#D4AF37] text-[#0A0A0A] border-[#D4AF37]'
                            : 'bg-[#1E1E1E] text-[#A1A1AA] border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {d}h
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={dispForm.duration_hours}
                    onChange={(e) => setDispForm({ ...dispForm, duration_hours: e.target.value })}
                    required
                    className="bg-[#1E1E1E] border-white/10"
                    placeholder="Ex: 2"
                  />
                </div>
                <div>
                  <Label className="text-[#A1A1AA]">Tarif (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dispForm.price}
                    onChange={(e) => setDispForm({ ...dispForm, price: e.target.value })}
                    required
                    className="bg-[#1E1E1E] border-white/10"
                    placeholder="Ex: 80"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={dispForm.is_active}
                    onCheckedChange={(v) => setDispForm({ ...dispForm, is_active: v })}
                    className="data-[state=checked]:bg-green-500"
                  />
                  <Label className="text-[#A1A1AA]">Actif</Label>
                </div>
                <Button
                  type="submit"
                  disabled={dispSubmitting}
                  className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]"
                >
                  {dispSubmitting ? 'Enregistrement...' : editingDispRate ? 'Modifier' : 'Ajouter'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default AdminPricing;
