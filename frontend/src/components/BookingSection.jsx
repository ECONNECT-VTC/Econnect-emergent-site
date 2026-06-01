import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, CarSimple, Timer, Users, Briefcase, WifiHigh } from '@phosphor-icons/react';
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

const VEHICLE_CATEGORIES = [
  { id: 'berline', name: 'Berline', passengers: 3, luggage: 2, wifi: false },
  { id: 'van', name: 'Van', passengers: 7, luggage: 5, wifi: false },
  { id: 'business', name: 'Business', passengers: 3, luggage: 2, wifi: true },
  { id: 'prestige', name: 'Prestige', passengers: 3, luggage: 2, wifi: true },
];

const BookingSection = () => {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (transferType === 'disposition' && !dispositionHours) {
      alert('Veuillez indiquer le nombre d\'heures de mise à disposition.');
      return;
    }
    const categoryLabel = VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Non spécifiée';
    const hoursLine = transferType === 'disposition' ? `\n- Durée: ${dispositionHours}h` : '';
    const message = `Bonjour, je souhaite réserver un VTC:\n- Date: ${date ? format(date, 'dd/MM/yyyy', { locale: fr }) : 'Non spécifiée'}\n- Heure: ${time || 'Non spécifiée'}\n- Départ: ${pickup || 'Non spécifié'}\n- Arrivée: ${dropoff || 'Non spécifié'}\n- Type: ${transferType || 'Non spécifié'}${hoursLine}\n- Gamme: ${categoryLabel}`;
    window.open(`https://wa.me/33XXXXXXXXX?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <section id="reserver" className="py-24 md:py-32 bg-[#141414]" data-testid="booking-section">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch min-h-[600px]">
          {/* Booking Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="h-full"
          >
            <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 md:p-10 h-full flex flex-col justify-between" data-testid="booking-form">
              <div className="flex flex-col gap-6">
                {/* Steps */}
                <div className="flex items-center justify-between">
                  {[1, 2, 3].map((step) => (
                    <div key={step} className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-[#D4AF37] text-[#0A0A0A] flex items-center justify-center font-bold">
                        {step}
                      </div>
                      {step < 3 && <div className="w-12 md:w-20 h-[2px] bg-[#D4AF37]/30 mx-2" />}  
                    </div>
                  ))}
                </div>

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

                {/* Disposition hours — required when transferType === 'disposition' */}
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
                      placeholder="Ex: 4 (peut dépasser 24h)"
                      className="bg-[#1E1E1E] border-white/10 focus:border-[#D4AF37]/50"
                      required
                      data-testid="disposition-hours-input"
                    />
                  </div>
                )}

                {/* Vehicle Category */}
                <div className="space-y-3">
                  <Label className="text-[#A1A1AA] text-sm flex items-center gap-2">
                    <CarSimple size={16} className="text-[#D4AF37]" />
                    Gamme de véhicule
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {VEHICLE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedCategory === cat.id
                            ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                            : 'border-white/10 bg-[#1E1E1E] hover:border-[#D4AF37]/50'
                        }`}
                      >
                        <p className="font-semibold text-sm text-white">{cat.name}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] text-[#D4AF37]">
                            <Users size={11} weight="fill" className="text-[#D4AF37]" />
                            {cat.passengers}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-[#D4AF37]">
                            <Briefcase size={11} weight="fill" className="text-[#D4AF37]" />
                            {cat.luggage}
                          </span>
                          {cat.wifi && (
                            <span className="flex items-center gap-1 text-[10px] text-[#D4AF37]">
                              <WifiHigh size={11} weight="fill" className="text-[#D4AF37]" />
                              WiFi
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-[#D4AF37] hover:bg-[#F0C74A] text-[#0A0A0A] font-semibold py-6 text-lg transition-all duration-300 hover:scale-[1.02]"
                data-testid="submit-booking"
              >
                {t('reserverMaintenant')}
                <ArrowRight size={20} className="ml-2" />
              </Button>
            </form>
          </motion.div>

          {/* Interactive Map */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-full min-h-[600px] rounded-2xl overflow-hidden"
          >
            <InteractiveMap />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BookingSection;