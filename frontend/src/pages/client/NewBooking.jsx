import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowRight, Calendar, Car, CheckCircle, CircleNotch, Clock, CurrencyEur, MapPin } from '@phosphor-icons/react';
import API_URL from '@/config';
import { parseBookingError } from './newBookingUtils';

const NewBooking = () => {
  const enableDebugLogging = process.env.NODE_ENV !== 'production';
  const navigate = useNavigate();
  const { lang = 'fr' } = useParams();
  const [date, setDate] = useState();
  const [time, setTime] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [transferType, setTransferType] = useState('');
  const [dispositionHours, setDispositionHours] = useState('');
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

  const fetchCategories = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/vehicle-categories`, {
        withCredentials: true
      });
      const safeCategories = Array.isArray(response.data) ? response.data : [];
      setCategories(safeCategories);
      if (enableDebugLogging) {
        console.info('Vehicle categories received:', safeCategories.map((category) => ({
          id: category.id,
          name: category.name,
          has_wifi: category.has_wifi,
          max_passengers: category.max_passengers,
          max_luggage: category.max_luggage
        })));
      }
    } catch (err) {
      setCategories([]);
      setError(parseBookingError(err, 'Erreur lors du chargement des catégories de véhicules'));
    }
  }, [enableDebugLogging]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const estimatePrice = useCallback(async () => {
    if (!distance || parseFloat(distance) <= 0) return;
    
    setEstimatingPrice(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/estimate-price?distance_km=${parseFloat(distance)}&duration_minutes=${parseFloat(duration) || 0}`,
        {},
        { withCredentials: true }
      );
      setPriceEstimates(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setPriceEstimates([]);
      setError(parseBookingError(err, 'Erreur lors du calcul des tarifs'));
    } finally {
      setEstimatingPrice(false);
    }
  }, [distance, duration]);

  useEffect(() => {
    if (distance && parseFloat(distance) > 0) {
      const timer = setTimeout(() => estimatePrice(), 500);
      return () => clearTimeout(timer);
    } else {
      setPriceEstimates([]);
    }
  }, [distance, duration, estimatePrice]);

  const timeSlots = Array.from({ length: 48 }, (_, i) => {
    const hours = String(Math.floor(i / 2)).padStart(2, '0');
    const minutes = i % 2 === 0 ? '00' : '30';
    return `${hours}:${minutes}`;
  });

  const getSelectedPrice = () => {
    if (!selectedCategory || priceEstimates.length === 0) return null;
    return priceEstimates.find(e => e.category_id === selectedCategory);
  };

  const getCategoryMeta = (category) => {
    const parseNumberOrNull = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    if (!category) return { hasWifi: false, passengers: null, luggage: null };
    return {
      hasWifi: category.has_wifi === true,
      passengers: parseNumberOrNull(category.max_passengers),
      luggage: parseNumberOrNull(category.max_luggage)
    };
  };

  useEffect(() => {
    if (!enableDebugLogging || priceEstimates.length === 0) return;

    const badgeDebug = priceEstimates.map((estimate) => {
      const category = categories.find(c => c.id === estimate.category_id || c.name === estimate.category_name);
      return {
        estimate_category_id: estimate.category_id,
        estimate_category_name: estimate.category_name,
        category_found: Boolean(category),
        has_wifi: category?.has_wifi ?? null,
        max_passengers: category?.max_passengers ?? null,
        max_luggage: category?.max_luggage ?? null
      };
    });

    console.info('Vehicle card badge data:', badgeDebug);
  }, [categories, priceEstimates, enableDebugLogging]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!date || !time || !pickup || !dropoff || !transferType) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (transferType === 'disposition' && !dispositionHours) {
      setError('Veuillez indiquer le nombre d\'heures de mise à disposition');
      return;
    }

    setLoading(true);
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
        notes: notes,
        disposition_hours: dispositionHours ? parseFloat(dispositionHours) : null
      }, { withCredentials: true });

      setSuccess(true);
      setTimeout(() => navigate(`/${lang}/client/bookings`), 2000);
    } catch (err) {
      setError(parseBookingError(err, 'Erreur lors de la réservation'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="glass rounded-xl p-12 text-center">
        <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold font-['Cormorant_Garamond'] mb-2">Réservation confirmée !</h2>
        <p className="text-[#A1A1AA]">Redirection...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
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
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
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

            {/* Disposition hours — shown and required when transferType === 'disposition' */}
            {transferType === 'disposition' && (
              <div className="space-y-2">
                <Label className="text-[#A1A1AA]">Nombre d'heures <span className="text-red-400">*</span></Label>
                <Input
                  type="number"
                  min="1"
                  step="0.5"
                  value={dispositionHours}
                  onChange={(e) => setDispositionHours(e.target.value)}
                  placeholder="Ex: 4 (peut dépasser 24h)"
                  className="bg-[#1E1E1E] border-white/10"
                  data-testid="disposition-hours-input"
                />
              </div>
            )}

            {/* Vehicle Category Selection */}
            {priceEstimates.length > 0 && (
              <div className="space-y-3">
                <Label className="text-[#A1A1AA]">Choisir votre vehicule</Label>
                <div className="grid sm:grid-cols-2 gap-3" data-testid="vehicle-selection">
                  {priceEstimates.map((estimate) => {
                    const category = categories.find(c => c.id === estimate.category_id || c.name === estimate.category_name);
                    const categoryMeta = getCategoryMeta(category);
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
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#A1A1AA]">
                              {categoryMeta.hasWifi && <span className="bg-white/5 rounded px-2 py-1" aria-label="WiFi disponible">📶 WiFi</span>}
                              {categoryMeta.passengers != null && (
                                <span className="bg-white/5 rounded px-2 py-1" aria-label={`Capacité passagers: ${categoryMeta.passengers}`}>👥 {categoryMeta.passengers}</span>
                              )}
                              {categoryMeta.luggage != null && (
                                <span className="bg-white/5 rounded px-2 py-1" aria-label={`Capacité bagages: ${categoryMeta.luggage}`}>🧳 {categoryMeta.luggage}</span>
                              )}
                            </div>
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
    </div>
  );
};

export default NewBooking;
