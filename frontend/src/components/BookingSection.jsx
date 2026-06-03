import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, CarSimple, Timer, CheckCircle, Users, Briefcase, WifiHigh } from '@phosphor-icons/react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { VEHICLE_CATEGORY_CONFIG } from '@/utils/vehicleCategories';

const VEHICLE_CATEGORIES = VEHICLE_CATEGORY_CONFIG.map((category) => ({
  id: category.backendName,
  name: category.displayName,
  translationKey: category.translationKey,
  passengers: category.passengers,
  luggage: category.luggage,
  hasWifi: category.hasWifi,
  startingPrice: category.startingPrice,
}));

const BookingSection = () => {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [time, setTime] = useState('');
  const [transferType, setTransferType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dispositionHours, setDispositionHours] = useState('');
  const { t } = useLanguage();

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

  const handleStep1Submit = (e) => {
    e.preventDefault();
    if (!canProceedToStep2) return;
    setStep(2);
  };

  const handleStep2Submit = (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      alert('Veuillez choisir une gamme de véhicule.');
      return;
    }
    setStep(3);
  };

  const getStartingPriceLabel = (startingPrice) => {
    const parsed = Number(String(startingPrice).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return startingPrice;
    const total = transferType === 'retour' ? parsed * 2 : parsed;
    return `${Math.round(total)}€`;
  };

  const handleStep3Submit = (e) => {
    e.preventDefault();
    const selectedVehicle = VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory);
    const categoryLabel = VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Non spécifiée';
    const categoryPriceLabel = selectedVehicle ? getStartingPriceLabel(selectedVehicle.startingPrice) : 'Sur devis';
    const hoursLine = transferType === 'disposition' ? `\n- Durée: ${dispositionHours}h` : '';
    const message = `Bonjour, je souhaite réserver un VTC:\n- Date: ${date ? format(date, 'dd/MM/yyyy', { locale: fr }) : 'Non spécifiée'}\n- Heure: ${time || 'Non spécifiée'}\n- Départ: ${pickup || 'Non spécifié'}\n- Arrivée: ${dropoff || 'Non spécifié'}\n- Type: ${transferType || 'Non spécifié'}${hoursLine}\n- Gamme: ${categoryLabel}\n- Tarif indicatif: ${categoryPriceLabel}`;
    window.open(`https://wa.me/33753418833?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <section id="reserver" className="pt-24 pb-12 md:pt-32 md:pb-16 bg-[#141414]" data-testid="booking-section">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Booking Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="w-full"
          >
            {/* Step indicators */}
            <div className="flex items-center gap-3 mb-6">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                    s < step ? 'bg-[#D4AF37] text-[#0A0A0A]' :
                    s === step ? 'bg-[#D4AF37] text-[#0A0A0A]' :
                    'bg-white/10 text-[#A1A1AA]'
                  }`}>
                    {s < step ? <CheckCircle size={18} weight="fill" /> : s}
                  </div>
                  {s < 3 && <div className="w-12 md:w-20 h-[2px] bg-[#D4AF37]/30 mx-2" />}
                </div>
              ))}
              <span className="text-[#A1A1AA] text-sm ml-2">
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
                  className="glass rounded-2xl p-8 md:p-10 space-y-6"
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
                  </div>

                  <Button
                    type="submit"
                    disabled={!canProceedToStep2}
                    className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed mt-6"
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
                  className="glass rounded-2xl p-8 md:p-10 space-y-6"
                  data-testid="vehicle-selection-form"
                >
                  <div className="flex flex-col gap-5">
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
                    </div>

                    {/* Vehicle selection */}
                    <div>
                      <Label className="text-[#A1A1AA] text-sm flex items-center gap-2 mb-3">
                        <CarSimple size={16} className="text-[#D4AF37]" />
                        Choisissez votre gamme
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {VEHICLE_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`p-4 rounded-xl border text-left transition-all ${
                              selectedCategory === cat.id
                                ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                                : 'border-white/10 bg-[#1E1E1E] hover:border-[#D4AF37]/50'
                            }`}
                            data-testid={`vehicle-cat-${cat.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-sm text-white">{cat.name}</p>
                              <span className="text-xs text-[#D4AF37] font-medium">
                                {transferType === 'disposition' && dispositionHours
                                  ? `Sur devis`
                                  : `dès ${getStartingPriceLabel(cat.startingPrice)}`}
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
                                  <WifiHigh size={12} className="text-[#D4AF37]" />
                                  Wi‑Fi
                                </span>
                              )}
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
                            ? `Mise à disposition · ${dispositionHours}h · Tarif sur devis`
                            : `${VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.name} · à partir de ${getStartingPriceLabel(VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.startingPrice || '')}`}
                        </p>
                        <p className="text-[#A1A1AA] text-xs mt-1">Le prix final sera confirmé par votre chauffeur.</p>
                      </motion.div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 text-[#A1A1AA] hover:bg-white/5"
                      onClick={() => setStep(1)}
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
                  className="glass rounded-2xl p-8 md:p-10 space-y-6"
                  data-testid="booking-confirmation-form"
                >
                  <div className="space-y-4 rounded-xl border border-[#D4AF37]/20 bg-[#1E1E1E] p-5 text-sm text-[#C7B588]">
                    <p className="flex items-center gap-2"><MapPin size={14} className="text-[#D4AF37]" /> {pickup} → {dropoff}</p>
                    <p className="flex items-center gap-2">
                      <Calendar size={14} className="text-[#D4AF37]" />
                      {date ? `${format(date, 'dd/MM/yyyy', { locale: fr })} à ${time}` : (time || 'Date à confirmer')}
                    </p>
                    <p className="flex items-center gap-2"><CarSimple size={14} className="text-[#D4AF37]" /> {VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory)?.name}</p>
                    {transferType === 'disposition' && dispositionHours ? (
                      <p className="flex items-center gap-2"><Timer size={14} className="text-[#D4AF37]" /> {dispositionHours}h · Tarif sur devis</p>
                    ) : (
                      <p className="text-[#D4AF37]">Tarif indicatif: {getStartingPriceLabel(VEHICLE_CATEGORIES.find((c) => c.id === selectedCategory)?.startingPrice || '')}</p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 text-[#A1A1AA] hover:bg-white/5"
                      onClick={() => setStep(2)}
                    >
                      Retour
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02]"
                      data-testid="submit-booking"
                    >
                      {t('reserverMaintenant')}
                      <ArrowRight size={20} className="ml-2" />
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Interactive Map */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="min-h-[420px] md:min-h-[520px] rounded-2xl overflow-hidden"
          >
            <InteractiveMap />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BookingSection;