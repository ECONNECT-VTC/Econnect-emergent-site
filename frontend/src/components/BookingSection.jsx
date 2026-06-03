import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, CarSimple, Timer, Users, Briefcase } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import InteractiveMap from './InteractiveMap';
import { PremiumWifiIcon } from './VehicleFeatureBadges';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { VEHICLE_CATEGORY_CONFIG, findDispositionEstimateForCategory, findVehicleCategoryByName } from '@/utils/vehicleCategories';
import API_URL from '@/config';
import {
  createCheckoutSession,
  readBookingCheckoutDraft,
  saveBookingCheckoutDraft,
} from '@/utils/bookingCheckout';

const VEHICLE_CATEGORIES = VEHICLE_CATEGORY_CONFIG.map((category) => ({
  id: category.backendName,
  name: category.displayName,
  translationKey: category.translationKey,
  passengers: category.passengers,
  luggage: category.luggage,
  hasWifi: category.hasWifi,
  image: category.image,
  startingPrice: category.startingPrice,
}));

const BookingSection = () => {
  const navigate = useNavigate();
  const { lang = 'fr' } = useParams();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [time, setTime] = useState('');
  const [transferType, setTransferType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dispositionHours, setDispositionHours] = useState('');
  const [dispositionPrices, setDispositionPrices] = useState([]);
  const [loadingDispositionPrices, setLoadingDispositionPrices] = useState(false);
  const [pricingCategories, setPricingCategories] = useState([]);
  const [priceEstimates, setPriceEstimates] = useState([]);
  const [estimatingPrice, setEstimatingPrice] = useState(false);
  const [distanceKm, setDistanceKm] = useState('');
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingNotice, setBookingNotice] = useState('');
  const autoCheckoutStartedRef = useRef(false);
  // Ref to access the latest submitCheckout without it being a dependency
  const submitCheckoutRef = useRef(null);
  // Ref to the form panel for smooth scroll on step changes (Bug 3b)
  const formPanelRef = useRef(null);
  const { t } = useLanguage();
  const bookingPanelMinHeight = 'lg:min-h-[680px]';

  const fetchPricingCategories = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/vehicle-categories`, {
        withCredentials: true,
      });
      setPricingCategories(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('[BookingSection] Failed to fetch vehicle categories:', err);
      setPricingCategories([]);
    }
  }, []);

  const fetchDispositionPrices = useCallback(async (hours) => {
    if (!hours || parseFloat(hours) <= 0) {
      setDispositionPrices([]);
      return;
    }
    setLoadingDispositionPrices(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/estimate-price?transfer_type=disposition&disposition_hours=${parseFloat(hours)}`,
        {},
        { withCredentials: true }
      );
      setDispositionPrices(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('[BookingSection] Failed to fetch disposition prices:', err);
      setDispositionPrices([]);
    } finally {
      setLoadingDispositionPrices(false);
    }
  }, []);

  useEffect(() => {
    fetchPricingCategories();
  }, [fetchPricingCategories]);

  useEffect(() => {
    if (transferType === 'disposition' && dispositionHours && parseFloat(dispositionHours) > 0) {
      const timer = setTimeout(() => fetchDispositionPrices(dispositionHours), 500);
      return () => clearTimeout(timer);
    } else {
      setDispositionPrices([]);
    }
  }, [dispositionHours, transferType, fetchDispositionPrices]);

  // Fetch distance-based price estimates from backend whenever relevant inputs change (Bug 3a)
  useEffect(() => {
    if (transferType === 'disposition' || !transferType) {
      setPriceEstimates([]);
      return;
    }
    const km = parseFloat(distanceKm);
    if (!(km > 0)) {
      setPriceEstimates([]);
      return;
    }
    const controller = new AbortController();
    setEstimatingPrice(true);
    const params = new URLSearchParams({ transfer_type: transferType, distance_km: String(km) });
    axios
      .post(`${API_URL}/api/estimate-price?${params}`, {}, {
        withCredentials: true,
        signal: controller.signal,
      })
      .then((res) => {
        setPriceEstimates(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (!axios.isCancel(err)) {
          console.error('[BookingSection] Failed to fetch price estimates:', err);
          setPriceEstimates([]);
        }
      })
      .finally(() => {
        setEstimatingPrice(false);
      });
    return () => controller.abort();
  }, [distanceKm, transferType]);

  const getFormattedDispositionPrice = useCallback((categoryId) => {
    if (loadingDispositionPrices) {
      return 'Chargement...';
    }

    const price = findDispositionEstimateForCategory(dispositionPrices, categoryId);
    if (price && Number.isFinite(price.final_price)) {
      return `${price.final_price.toFixed(2)}€`;
    }

    return 'Tarif indisponible';
  }, [dispositionPrices, loadingDispositionPrices]);

  const timeSlots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      timeSlots.push(`${hour}:${minute}`);
    }
  }

  const canProceedToStep2 = date && time && pickup && dropoff && transferType &&
    (transferType !== 'disposition' || dispositionHours);

  // Smooth scroll to the top of the booking form panel on step changes (Bug 3b)
  const scrollToFormPanel = useCallback(() => {
    setTimeout(() => {
      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, []);

  const handleStep1Submit = (e) => {
    e.preventDefault();
    if (!canProceedToStep2) return;
    setStep(2);
    scrollToFormPanel();
  };

  const handleStep2Submit = (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      alert('Veuillez choisir une gamme de véhicule.');
      return;
    }
    setStep(3);
    scrollToFormPanel();
  };

  const getStartingPriceLabel = (startingPrice) => {
    const parsed = Number(String(startingPrice).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return startingPrice;
    const total = transferType === 'retour' ? parsed * 2 : parsed;
    return `${Math.round(total)}€`;
  };

  const pricingMinFareByCategory = useMemo(
    () => Object.fromEntries(
      VEHICLE_CATEGORIES.map((category) => {
        const matchedCategory = findVehicleCategoryByName(pricingCategories, category.id);
        const minFare = Number(matchedCategory?.min_fare);
        return [category.id, Number.isFinite(minFare) ? minFare : null];
      })
    ),
    [pricingCategories]
  );

  const getCategoryStartingPrice = useCallback(
    (categoryId, fallbackStartingPrice) => pricingMinFareByCategory[categoryId] ?? fallbackStartingPrice,
    [pricingMinFareByCategory]
  );

  const getCategoryStartingPriceLabel = (categoryId, fallbackStartingPrice) =>
    getStartingPriceLabel(getCategoryStartingPrice(categoryId, fallbackStartingPrice));

  // Returns a formatted price label for a given category in step 2 vehicle cards (Bug 3a)
  const getCategoryPriceLabel = useCallback((categoryId, fallbackStartingPrice) => {
    if (transferType === 'disposition' && dispositionHours) {
      return getFormattedDispositionPrice(categoryId);
    }
    // Show distance-based estimate if available
    if (estimatingPrice) return 'Calcul...';
    const distanceEstimate = findDispositionEstimateForCategory(priceEstimates, categoryId);
    if (distanceEstimate && Number.isFinite(Number(distanceEstimate.final_price)) && Number(distanceEstimate.final_price) > 0) {
      return `${Number(distanceEstimate.final_price).toFixed(2)}€`;
    }
    // Fall back to minimum fare label
    return `dès ${getCategoryStartingPriceLabel(categoryId, fallbackStartingPrice)}`;
  }, [transferType, dispositionHours, estimatingPrice, priceEstimates, getFormattedDispositionPrice, getCategoryStartingPriceLabel]);

  const getEstimatedPrice = useCallback(() => {
    if (!selectedCategory) return null;
    if (transferType === 'disposition') {
      const dispositionEstimate = findDispositionEstimateForCategory(dispositionPrices, selectedCategory);
      const dispositionPrice = Number(dispositionEstimate?.final_price);
      return Number.isFinite(dispositionPrice) && dispositionPrice > 0 ? dispositionPrice : null;
    }
    // Use backend estimate (distance-based) when available (Bug 3a)
    const distanceEstimate = findDispositionEstimateForCategory(priceEstimates, selectedCategory);
    const estimatedFromDistance = Number(distanceEstimate?.final_price);
    if (Number.isFinite(estimatedFromDistance) && estimatedFromDistance > 0) {
      return estimatedFromDistance;
    }
    // Fallback to min_fare (or parsed startingPrice) when no distance estimate is available
    const selectedVehicle = VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory);
    if (!selectedVehicle) return null;
    const rawPriceSource = getCategoryStartingPrice(selectedVehicle.id, selectedVehicle.startingPrice);
    // Parse numeric value, stripping any currency symbols (e.g. '30€' → 30)
    const rawPrice = Number(String(rawPriceSource).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
    return transferType === 'retour' ? rawPrice * 2 : rawPrice;
  }, [dispositionPrices, priceEstimates, selectedCategory, transferType, getCategoryStartingPrice]);

  const buildCheckoutPayload = useCallback(() => {
    const estimatedPrice = getEstimatedPrice();
    if (!estimatedPrice) return null;
    return {
      pickup_address: pickup,
      dropoff_address: dropoff,
      pickup_date: date ? format(date, 'dd/MM/yyyy', { locale: fr }) : '',
      pickup_time: time,
      transfer_type: transferType,
      vehicle_category_id: selectedCategory || null,
      distance_km: transferType === 'disposition' ? null : (distanceKm ? parseFloat(distanceKm) : null),
      duration_minutes: null,
      estimated_price: estimatedPrice,
      notes: null,
      disposition_hours: transferType === 'disposition' && dispositionHours ? parseFloat(dispositionHours) : null,
      success_path: `/${lang}/booking/confirmation`,
      cancel_path: `/${lang}/booking/cancel`,
    };
  }, [date, time, pickup, dropoff, transferType, selectedCategory, distanceKm, dispositionHours, getEstimatedPrice, lang]);

  const submitCheckout = useCallback(async (payload, draftState = null) => {
    setBookingError('');
    setBookingNotice('Vous allez être redirigé vers la plateforme de paiement sécurisée Stripe...');
    setSubmittingCheckout(true);

    const draft = draftState || {
      date: date ? date.toISOString() : null,
      pickup,
      dropoff,
      time,
      transferType,
      selectedCategory,
      dispositionHours,
      distanceKm,
      step: 3,
      autoPayAfterAuth: false,
      checkoutPayload: payload,
    };
    saveBookingCheckoutDraft(draft);

    try {
      const checkout = await createCheckoutSession(payload);
      if (!checkout?.checkout_url) {
        throw new Error('URL de paiement Stripe manquante');
      }
      window.location.href = checkout.checkout_url;
    } catch (error) {
      setBookingError(error?.response?.data?.detail || 'Impossible de lancer le paiement Stripe.');
      setBookingNotice('');
      setSubmittingCheckout(false);
    }
  }, [date, pickup, dropoff, time, transferType, selectedCategory, dispositionHours, distanceKm]);

  // Keep submitCheckoutRef current so the auto-checkout effect can use the latest version
  // without needing to list it as a dependency (Bug 1 fix)
  useEffect(() => {
    submitCheckoutRef.current = submitCheckout;
  });

  // Effect 1: Restore draft state ONCE on mount — no reactive deps to avoid infinite loop (Bug 1 fix)
  useEffect(() => {
    const draft = readBookingCheckoutDraft();
    if (!draft) return;
    if (draft.date) setDate(new Date(draft.date));
    if (draft.pickup) setPickup(draft.pickup);
    if (draft.dropoff) setDropoff(draft.dropoff);
    if (draft.time) setTime(draft.time);
    if (draft.transferType) setTransferType(draft.transferType);
    if (draft.selectedCategory) setSelectedCategory(draft.selectedCategory);
    if (draft.dispositionHours) setDispositionHours(String(draft.dispositionHours));
    if (draft.distanceKm) setDistanceKm(String(draft.distanceKm));
    if (draft.step) setStep(draft.step);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Auto-checkout when user logs in after saving a draft (Bug 1 fix)
  // Depends only on `user`; uses submitCheckoutRef to avoid stale-closure issues.
  useEffect(() => {
    if (!user) return;
    const draft = readBookingCheckoutDraft();
    if (!draft?.autoPayAfterAuth || !draft?.checkoutPayload || autoCheckoutStartedRef.current) return;
    autoCheckoutStartedRef.current = true;
    submitCheckoutRef.current(draft.checkoutPayload, { ...draft, autoPayAfterAuth: false });
  }, [user]);

  const handleStep3Submit = async (e) => {
    e.preventDefault();
    const payload = buildCheckoutPayload();
    if (!payload) {
      setBookingError('Impossible de déterminer le montant estimé pour le paiement.');
      return;
    }

    if (!user) {
      saveBookingCheckoutDraft({
        date: date ? date.toISOString() : null,
        pickup,
        dropoff,
        time,
        transferType,
        selectedCategory,
        dispositionHours,
        distanceKm,
        step: 3,
        autoPayAfterAuth: true,
        checkoutPayload: payload,
      });
      setBookingNotice('Connectez-vous ou créez un compte pour valider le paiement sécurisé Stripe.');
      navigate(`/${lang}/login`, {
        state: { from: { pathname: `/${lang}`, hash: '#reserver' } },
      });
      return;
    }

    await submitCheckout(payload);
  };

  return (
    <section id="reserver" className="pt-20 pb-10 md:pt-24 md:pb-14 bg-[#141414]" data-testid="booking-section">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-[#D4AF37] text-sm tracking-[0.3em] uppercase">{t('reservationLabel')}</span>
          <h2 className="text-4xl md:text-5xl font-bold font-['Cormorant_Garamond'] mt-4 tracking-tight" data-testid="booking-title">
            {t('bookingTitle1')}
            <br />
            <span className="gold-text">{t('bookingTitle2')}</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start lg:items-stretch">
          {/* Booking Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="w-full h-full flex flex-col"
          >
            <div ref={formPanelRef} className={`glass rounded-2xl p-8 md:p-10 flex-1 flex flex-col ${bookingPanelMinHeight}`}>
            {/* Step indicators */}
            <div className="mb-8 flex flex-col items-center gap-4 text-center flex-shrink-0">
              <div className="flex w-full items-center justify-center gap-2 sm:gap-3">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#121212] text-sm font-semibold text-[#F3D67A] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                      {s}
                    </div>
                    {s < 3 && <div className="mx-2 h-px w-10 bg-[#D4AF37]/35 sm:w-16 md:w-20" />}
                  </div>
                ))}
              </div>
              <span className="text-sm tracking-[0.18em] uppercase text-[#C7B588]">
                {step === 1 ? t('typeTransfert') || 'Votre trajet' : step === 2 ? 'Choisir votre véhicule' : 'Valider votre demande'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.form
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleStep1Submit}
                  className="flex-1 flex flex-col space-y-6"
                  data-testid="booking-form"
                >
                  <div className="flex flex-col gap-6">
                    {/* Date & Time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="date" className="text-[#A1A1AA] text-sm">{t('datePriseEnCharge')}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal bg-[#1E1E1E] border-white/10 hover:bg-[#252525] hover:border-[#D4AF37]/50"
                              data-testid="date-picker-trigger"
                            >
                              <Calendar size={18} className="mr-2 text-[#D4AF37]" />
                              {date ? format(date, 'dd/MM/yyyy', { locale: fr }) : t('choisirUneDate')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-[#1E1E1E] border-white/10" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={date}
                              onSelect={setDate}
                              disabled={(date) => date < new Date()}
                              initialFocus
                              className="bg-[#1E1E1E]"
                              data-testid="calendar"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="time" className="text-[#A1A1AA] text-sm">{t('heurePriseEnCharge')}</Label>
                        <Select value={time} onValueChange={setTime}>
                          <SelectTrigger className="bg-[#1E1E1E] border-white/10 hover:border-[#D4AF37]/50" data-testid="time-select">
                            <Clock size={18} className="mr-2 text-[#D4AF37]" />
                            <SelectValue placeholder={t('choisirUneHeure')} />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1E1E1E] border-white/10 max-h-60">
                            {timeSlots.map((slot) => (
                              <SelectItem key={slot} value={slot} className="hover:bg-[#D4AF37]/10">
                                {slot}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Pickup & Dropoff */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="pickup" className="text-[#A1A1AA] text-sm">{t('lieuPriseEnCharge')}</Label>
                        <div className="relative">
                          <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
                          <Input
                            id="pickup"
                            value={pickup}
                            onChange={(e) => setPickup(e.target.value)}
                            placeholder={t('adresseDepart')}
                            className="pl-10 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                            data-testid="pickup-input"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="dropoff" className="text-[#A1A1AA] text-sm">{t('lieuDepot')}</Label>
                        <div className="relative">
                          <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
                          <Input
                            id="dropoff"
                            value={dropoff}
                            onChange={(e) => setDropoff(e.target.value)}
                            placeholder={t('adresseArrivee')}
                            className="pl-10 bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                            data-testid="dropoff-input"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Transfer Type */}
                    <div className="space-y-2">
                      <Label className="text-[#A1A1AA] text-sm">{t('typeTransfert')}</Label>
                      <Select value={transferType} onValueChange={setTransferType}>
                        <SelectTrigger className="bg-[#1E1E1E] border-white/10 hover:border-[#D4AF37]/50" data-testid="transfer-type-select">
                          <SelectValue placeholder={t('choisirUnType')} />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E1E1E] border-white/10">
                          <SelectItem value="simple" className="hover:bg-[#D4AF37]/10">{t('sensUnique')}</SelectItem>
                          <SelectItem value="retour" className="hover:bg-[#D4AF37]/10">{t('allerRetour')}</SelectItem>
                          <SelectItem value="disposition" className="hover:bg-[#D4AF37]/10">{t('miseDisposition')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Disposition hours */}
                    {transferType === 'disposition' && (
                      <div className="space-y-2">
                        <Label htmlFor="disposition-hours" className="text-[#A1A1AA] text-sm flex items-center gap-2">
                          <Timer size={16} className="text-[#D4AF37]" />
                          Nombre d'heures <span className="text-red-400">*</span>
                        </Label>
                        <Input
                          id="disposition-hours"
                          type="number"
                          min="1"
                          step="0.5"
                          value={dispositionHours}
                          onChange={(e) => setDispositionHours(e.target.value)}
                          placeholder="Ex: 4"
                          className="bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                          required
                          data-testid="disposition-hours-input"
                        />
                      </div>
                    )}

                    {/* Distance km — shown for non-disposition transfers */}
                    {transferType && transferType !== 'disposition' && (
                      <div className="space-y-2">
                        <Label htmlFor="distance-km" className="text-[#A1A1AA] text-sm flex items-center gap-2">
                          <MapPin size={16} className="text-[#D4AF37]" />
                          Distance estimée (km)
                        </Label>
                        <Input
                          id="distance-km"
                          type="number"
                          min="0"
                          step="0.1"
                          value={distanceKm}
                          onChange={(e) => setDistanceKm(parseFloat(e.target.value) > 0 ? e.target.value : '')}
                          placeholder="Ex: 15"
                          className="bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                          data-testid="distance-km-input"
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={!canProceedToStep2}
                    className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
                    data-testid="proceed-to-vehicles"
                  >
                    Voir les véhicules disponibles
                    <ArrowRight size={20} className="ml-2" />
                  </Button>
                </motion.form>
              )}

              {step === 2 && (
                <motion.form
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleStep2Submit}
                  className="flex-1 flex flex-col space-y-8"
                  data-testid="vehicle-selection-form"
                >
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                    {/* Recap */}
                    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#1E1E1E] p-4 text-sm text-[#C7B588] space-y-1">
                      <p className="flex items-center gap-2"><MapPin size={14} className="text-[#D4AF37]" /> {pickup} → {dropoff}</p>
                      <p className="flex items-center gap-2">
                        <Calendar size={14} className="text-[#D4AF37]" />
                        {date ? `${format(date, 'dd/MM/yyyy', { locale: fr })} à ${time}` : (time || 'Date à confirmer')}
                      </p>
                      {transferType === 'disposition' && dispositionHours && (
                        <p className="flex items-center gap-2"><Timer size={14} className="text-[#D4AF37]" /> {dispositionHours}h de mise à disposition</p>
                      )}
                      {transferType !== 'disposition' && distanceKm && (
                        <p className="flex items-center gap-2"><MapPin size={14} className="text-[#D4AF37]" /> {distanceKm} km</p>
                      )}
                    </div>

                    {/* Vehicle selection */}
                    <div className="space-y-4 text-center">
                      <Label className="justify-center text-[#A1A1AA] text-sm flex items-center gap-2">
                        <CarSimple size={16} className="text-[#D4AF37]" />
                        Choisissez votre gamme
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {VEHICLE_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`overflow-hidden rounded-2xl border text-left transition-all ${
                              selectedCategory === cat.id
                                ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_18px_40px_rgba(212,175,55,0.08)]'
                                : 'border-white/10 bg-[#1E1E1E] hover:border-[#D4AF37]/50'
                            }`}
                            data-testid={`vehicle-cat-${cat.id}`}
                          >
                            <div className="relative h-36 overflow-hidden bg-[#141414]">
                              <img
                                src={cat.image}
                                alt={cat.name}
                                className="h-full w-full object-contain transition-transform duration-500 hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/30 to-transparent" />
                            </div>
                            <div className="space-y-3 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold text-sm text-white">{cat.name}</p>
                                <span className="text-xs text-[#D4AF37] font-medium">
                                  {getCategoryPriceLabel(cat.id, cat.startingPrice)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[#A1A1AA]">
                                <span className="flex items-center gap-1 text-xs">
                                  <Users size={12} className="text-[#D4AF37]" />
                                  {cat.passengers}
                                </span>
                                <span className="flex items-center gap-1 text-xs">
                                  <Briefcase size={12} className="text-[#D4AF37]" />
                                  {cat.luggage}
                                </span>
                                {cat.hasWifi && (
                                  <span className="flex items-center gap-1 text-xs">
                                    <PremiumWifiIcon size={12} className="text-[#D4AF37]" />
                                    Wi‑Fi
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Price info */}
                    {selectedCategory && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-4"
                      >
                        <p className="text-[#D4AF37] text-sm font-medium">
                          {transferType === 'disposition' && dispositionHours
                            ? `Mise à disposition · ${dispositionHours}h · ${getFormattedDispositionPrice(selectedCategory)}`
                            : `${VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.name} · à partir de ${getCategoryStartingPriceLabel(selectedCategory, VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.startingPrice || '')}`}
                        </p>
                        <p className="text-[#A1A1AA] text-xs mt-1">Le prix final sera confirmé par votre chauffeur.</p>
                      </motion.div>
                    )}
                  </div>

                  <div className="mx-auto mt-6 flex w-full max-w-4xl gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 text-[#A1A1AA] hover:bg-white/5"
                      onClick={() => { setStep(1); scrollToFormPanel(); }}
                    >
                      Retour
                    </Button>
                    <Button
                      type="submit"
                      disabled={!selectedCategory}
                      className="flex-1 bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="continue-booking-step-3"
                    >
                      Continuer
                      <ArrowRight size={20} className="ml-2" />
                    </Button>
                  </div>
                </motion.form>
              )}

              {step === 3 && (
                <motion.form
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleStep3Submit}
                  className="flex-1 flex flex-col space-y-6"
                  data-testid="booking-confirmation-form"
                >
                  {bookingNotice && (
                    <div
                      className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 text-sm text-[#F3D67A]"
                      data-testid="booking-checkout-notice"
                    >
                      {bookingNotice}
                    </div>
                  )}
                  {bookingError && (
                    <div
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                      data-testid="booking-checkout-error"
                    >
                      {bookingError}
                    </div>
                  )}
                  <div className="space-y-4 rounded-xl border border-[#D4AF37]/20 bg-[#1E1E1E] p-5 text-sm text-[#C7B588]">
                    <p className="flex items-center gap-2"><MapPin size={14} className="text-[#D4AF37]" /> {pickup} → {dropoff}</p>
                    <p className="flex items-center gap-2">
                      <Calendar size={14} className="text-[#D4AF37]" />
                      {date ? `${format(date, 'dd/MM/yyyy', { locale: fr })} à ${time}` : (time || 'Date à confirmer')}
                    </p>
                    <p className="flex items-center gap-2"><CarSimple size={14} className="text-[#D4AF37]" /> {VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory)?.name}</p>
                    {transferType !== 'disposition' && distanceKm && (
                      <p className="flex items-center gap-2"><MapPin size={14} className="text-[#D4AF37]" /> Distance : {distanceKm} km</p>
                    )}
                    {transferType === 'disposition' && dispositionHours ? (
                      <p className="flex items-center gap-2">
                        <Timer size={14} className="text-[#D4AF37]" />
                        {`${dispositionHours}h · ${getFormattedDispositionPrice(selectedCategory)}`}
                      </p>
                    ) : (
                      <p className="text-[#D4AF37]">Tarif indicatif: {getCategoryStartingPriceLabel(selectedCategory, VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory)?.startingPrice || '')}</p>
                    )}
                  </div>

                  <div className="flex gap-3 mt-auto">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 text-[#A1A1AA] hover:bg-white/5"
                      onClick={() => { setStep(2); scrollToFormPanel(); }}
                    >
                      Retour
                    </Button>
                    <Button
                      type="submit"
                      disabled={submittingCheckout}
                      className="flex-1 bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02]"
                      data-testid="submit-booking"
                    >
                      {submittingCheckout ? 'Redirection vers Stripe...' : t('reserverMaintenant')}
                      <ArrowRight size={20} className="ml-2" />
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
            </div>
          </motion.div>

          {/* Interactive Map */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={`h-full rounded-2xl overflow-hidden ${bookingPanelMinHeight}`}
          >
            <InteractiveMap />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BookingSection;