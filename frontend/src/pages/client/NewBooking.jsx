import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MapPin, Calendar, Clock, ArrowRight, CircleNotch, CheckCircle, Car, CurrencyEur } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const NewBooking = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState();
  const [time, setTime] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [transferType, setTransferType] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Vehicle & pricing
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [priceEstimates, setPriceEstimates] = useState([]);
  const [estimatingPrice, setEstimatingPrice] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/vehicle-categories`, {
        withCredentials: true
      });
      setCategories(response.data);
    } catch (error) { console.error('Error:', error); }
  };

  const estimatePrice = async () => {
    if (!distance || parseFloat(distance) <= 0) return;
    
    setEstimatingPrice(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/estimate-price?distance_km=${parseFloat(distance)}&duration_minutes=${parseFloat(duration) || 0}`,
        {},
        { withCredentials: true }
      );
      setPriceEstimates(response.data);
    } catch (error) { 
      console.error('Error:', error); 
    } finally {
      setEstimatingPrice(false);
    }
  };

  useEffect(() => {
    if (distance && parseFloat(distance) > 0) {
      const timer = setTimeout(() => estimatePrice(), 500);
      return () => clearTimeout(timer);
    } else {
      setPriceEstimates([]);
    }
  }, [distance, duration]);

  const timeSlots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }

  const getSelectedPrice = () => {
    if (!selectedCategory || priceEstimates.length === 0) return null;
    return priceEstimates.find(e => e.category_id === selectedCategory);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!date || !time || !pickup || !dropoff || !transferType) {
      setError('Veuillez remplir tous les champs obligatoires');
      setLoading(false);
      return;
    }

    const selectedPrice = getSelectedPrice();

    try {
      await axios.post(`${API_URL}/api/bookings`, {
        pickup_address: pickup,
        dropoff_address: dropoff,
        pickup_date: format(date, 'dd/MM/yyyy', { locale: fr }),
        pickup_time: time,
        transfer_type: transferType,
        vehicle_category_id: selectedCategory,
        distance_km: distance ? parseFloat(distance) : null,
        duration_minutes: duration ? parseFloat(duration) : null,
        estimated_price: selectedPrice?.final_price || null,
        notes: notes
      }, { withCredentials: true });

      setSuccess(true);
      setTimeout(() => navigate('/client/bookings'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la reservation');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <DashboardLayout title="Nouvelle Reservation">
        <div className="glass rounded-xl p-12 text-center">
          <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold font-['Cormorant_Garamond'] mb-2">Reservation confirmee !</h2>
          <p className="text-[#A1A1AA]">Redirection...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Nouvelle Reservation">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 glass rounded-xl p-6 md:p-8" data-testid="new-booking-form">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Date & Time */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left bg-[#1E1E1E] border-white/10" data-testid="date-picker">
                      <Calendar size={18} className="mr-2 text-[#D4AF37]" />
                      {date ? format(date, 'dd/MM/yyyy', { locale: fr }) : 'Choisir'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#1E1E1E] border-white/10">
                    <CalendarComponent mode="single" selected={date} onSelect={setDate} disabled={(d) => d < new Date()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Heure *</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger className="bg-[#1E1E1E] border-white/10" data-testid="time-select">
                    <Clock size={18} className="mr-2 text-[#D4AF37]" />
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1E1E1E] border-white/10 max-h-60">
                    {timeSlots.map((slot) => (<SelectItem key={slot} value={slot}>{slot}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Addresses */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Adresse de depart *</Label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400" />
                  <Input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Entrez l'adresse" className="pl-10 bg-[#1E1E1E] border-white/10" data-testid="pickup-input" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Adresse d'arrivee *</Label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" />
                  <Input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Entrez l'adresse" className="pl-10 bg-[#1E1E1E] border-white/10" data-testid="dropoff-input" />
                </div>
              </div>
            </div>

            {/* Distance & Duration (manual input for now, can be auto with Google Maps) */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Distance estimee (km)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={distance} 
                  onChange={(e) => setDistance(e.target.value)} 
                  placeholder="Ex: 15.5" 
                  className="bg-[#1E1E1E] border-white/10" 
                  data-testid="distance-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Duree estimee (min)</Label>
                <Input 
                  type="number"
                  min="0"
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)} 
                  placeholder="Ex: 30" 
                  className="bg-[#1E1E1E] border-white/10"
                  data-testid="duration-input"
                />
              </div>
            </div>

            {/* Transfer Type */}
            <div className="space-y-2">
              <Label className="text-[#A1A1AA]">Type de transfert *</Label>
              <Select value={transferType} onValueChange={setTransferType}>
                <SelectTrigger className="bg-[#1E1E1E] border-white/10" data-testid="transfer-type">
                  <SelectValue placeholder="Choisir le type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E1E1E] border-white/10">
                  <SelectItem value="simple">Sens Unique</SelectItem>
                  <SelectItem value="retour">Aller-Retour</SelectItem>
                  <SelectItem value="disposition">Mise a Disposition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vehicle Category Selection */}
            {priceEstimates.length > 0 && (
              <div className="space-y-3">
                <Label className="text-[#A1A1AA]">Choisir votre vehicule</Label>
                <div className="grid sm:grid-cols-2 gap-3" data-testid="vehicle-selection">
                  {priceEstimates.map((estimate) => {
                    const category = categories.find(c => c.id === estimate.category_id);
                    const isSelected = selectedCategory === estimate.category_id;
                    return (
                      <div 
                        key={estimate.category_id}
                        onClick={() => setSelectedCategory(estimate.category_id)}
                        className={`p-4 rounded-xl cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-[#D4AF37]/20 border-2 border-[#D4AF37]' 
                            : 'bg-[#1E1E1E] border-2 border-transparent hover:border-white/20'
                        }`}
                        data-testid={`vehicle-${estimate.category_id}`}
                      >
                        <div className="flex items-start gap-3">
                          {category?.image_url ? (
                            <img src={category.image_url} alt={estimate.category_name} className="w-16 h-12 object-cover rounded" />
                          ) : (
                            <Car size={32} className="text-[#D4AF37]" />
                          )}
                          <div className="flex-1">
                            <p className="font-bold">{estimate.category_name}</p>
                            <p className="text-xs text-[#A1A1AA]">{estimate.price_per_km.toFixed(2)}€/km</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-[#D4AF37]">{estimate.final_price.toFixed(2)}€</p>
                            {estimate.final_price === estimate.min_fare && (
                              <p className="text-xs text-[#A1A1AA]">Tarif min.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-[#A1A1AA]">Notes (optionnel)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions speciales..." className="bg-[#1E1E1E] border-white/10 min-h-[80px]" data-testid="notes-input" />
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6" data-testid="submit-booking">
              {loading ? <CircleNotch size={20} className="animate-spin" /> : <>Confirmer <ArrowRight size={20} className="ml-2" /></>}
            </Button>
          </form>
        </div>

        {/* Price Summary Sidebar */}
        <div className="glass rounded-xl p-6 h-fit sticky top-24">
          <h3 className="text-lg font-bold font-['Cormorant_Garamond'] mb-4 flex items-center gap-2">
            <CurrencyEur size={24} className="text-[#D4AF37]" />
            Estimation tarifaire
          </h3>

          {!distance ? (
            <p className="text-[#A1A1AA] text-sm">Entrez la distance pour voir les tarifs.</p>
          ) : estimatingPrice ? (
            <div className="flex items-center gap-2 text-[#A1A1AA]">
              <CircleNotch size={20} className="animate-spin" />
              Calcul en cours...
            </div>
          ) : priceEstimates.length === 0 ? (
            <p className="text-[#A1A1AA] text-sm">Aucune categorie disponible.</p>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#1E1E1E] rounded-lg p-4">
                <p className="text-sm text-[#A1A1AA]">Distance</p>
                <p className="text-xl font-bold">{parseFloat(distance).toFixed(1)} km</p>
              </div>

              {selectedCategory && getSelectedPrice() && (
                <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/50 rounded-lg p-4">
                  <p className="text-sm text-[#A1A1AA]">Vehicule selectionne</p>
                  <p className="font-bold">{getSelectedPrice().category_name}</p>
                  <div className="mt-2 pt-2 border-t border-[#D4AF37]/30">
                    <p className="text-sm text-[#A1A1AA]">Prix estime</p>
                    <p className="text-3xl font-bold text-[#D4AF37]">{getSelectedPrice().final_price.toFixed(2)}€</p>
                  </div>
                </div>
              )}

              <div className="text-xs text-[#A1A1AA]">
                * Prix indicatif. Le tarif final peut varier selon les conditions de circulation.
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewBooking;
