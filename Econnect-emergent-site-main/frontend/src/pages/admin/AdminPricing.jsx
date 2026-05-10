import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Car, Plus, PencilSimple, Trash, CurrencyEur } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminPricing = () => {
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

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/vehicle-categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
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
        await axios.put(`${API_URL}/api/admin/vehicle-categories/${editingCategory.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API_URL}/api/admin/vehicle-categories`, payload, { withCredentials: true });
      }
      setIsOpen(false);
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur');
    } finally { setSubmitting(false); }
  };

  const toggleActive = async (category) => {
    try {
      await axios.put(`${API_URL}/api/admin/vehicle-categories/${category.id}`, 
        { is_active: !category.is_active }, 
        { withCredentials: true }
      );
      fetchCategories();
    } catch (error) { console.error('Error:', error); }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Supprimer cette categorie ?')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/vehicle-categories/${id}`, { withCredentials: true });
      fetchCategories();
    } catch (error) { console.error('Error:', error); }
  };

  return (
    <DashboardLayout title="Gestion des Tarifs">
      <div className="flex justify-between items-center mb-6">
        <p className="text-[#A1A1AA]">{categories.length} categorie(s) de vehicules</p>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]" data-testid="add-category-btn">
              <Plus size={18} className="mr-2" />Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#141414] border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[#D4AF37]">
                {editingCategory ? 'Modifier la categorie' : 'Nouvelle categorie'}
              </DialogTitle>
            </DialogHeader>
            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-[#A1A1AA]">Nom</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required 
                  className="bg-[#1E1E1E] border-white/10" 
                  placeholder="Ex: Berline, Van, Luxe"
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Description</Label>
                <Textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData({...formData, description: e.target.value})} 
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
                    onChange={(e) => setFormData({...formData, price_per_km: e.target.value})} 
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
                    onChange={(e) => setFormData({...formData, min_fare: e.target.value})} 
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
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})} 
                  className="bg-[#1E1E1E] border-white/10"
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label className="text-[#A1A1AA]">Ordre d'affichage</Label>
                <Input 
                  type="number"
                  value={formData.order} 
                  onChange={(e) => setFormData({...formData, order: e.target.value})} 
                  className="bg-[#1E1E1E] border-white/10"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A]">
                {submitting ? 'Enregistrement...' : editingCategory ? 'Modifier' : 'Creer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div> : categories.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Car size={48} className="text-[#A1A1AA] mx-auto mb-4" />
          <p className="text-[#A1A1AA]">Aucune categorie</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4" data-testid="categories-list">
          {categories.map((category) => (
            <div key={category.id} className={`glass rounded-xl overflow-hidden ${!category.is_active ? 'opacity-60' : ''}`}>
              {category.image_url && (
                <div className="h-32 overflow-hidden">
                  <img src={category.image_url} alt={category.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-xl">{category.name}</h3>
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

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-[#1E1E1E] rounded-lg p-4">
                    <p className="text-xs text-[#A1A1AA] uppercase mb-1">Prix / km</p>
                    <p className="text-2xl font-bold text-[#D4AF37]">{category.price_per_km.toFixed(2)}€</p>
                  </div>
                  <div className="bg-[#1E1E1E] rounded-lg p-4">
                    <p className="text-xs text-[#A1A1AA] uppercase mb-1">Tarif minimum</p>
                    <p className="text-2xl font-bold text-[#D4AF37]">{category.min_fare.toFixed(2)}€</p>
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
    </DashboardLayout>
  );
};

export default AdminPricing;
