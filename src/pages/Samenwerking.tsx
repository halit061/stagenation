import { useState } from 'react';
import { Truck, Coffee, IceCream, ShoppingBag, Megaphone, Store, UtensilsCrossed, Send, CheckCircle, ArrowLeft } from 'lucide-react';

interface SamenwerkingProps {
  onNavigate?: (page: string) => void;
}

const CONCEPT_TYPES = [
  'Foodtruck',
  'Desserts & Sweets',
  'Koffiebar',
  'Merchandise',
  'Sponsor activatie',
  'Pop-up stand',
  'Catering partner',
  'Anders',
];

const MOGELIJKHEDEN = [
  { icon: Truck, label: 'Foodtrucks', desc: 'Street food & klassiekers' },
  { icon: IceCream, label: 'Desserts & Sweets', desc: 'Wafels, ijs & gebak' },
  { icon: Coffee, label: 'Koffiebars', desc: 'Specialty coffee & drinks' },
  { icon: ShoppingBag, label: 'Merchandise', desc: 'Kleding & accessoires' },
  { icon: Megaphone, label: 'Sponsor activaties', desc: 'Brand experiences' },
  { icon: Store, label: 'Pop-up standen', desc: 'Unieke concepten' },
  { icon: UtensilsCrossed, label: 'Catering partners', desc: 'Full-service catering' },
];

export function Samenwerking({ onNavigate }: SamenwerkingProps) {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    bedrijf: '',
    contactpersoon: '',
    email: '',
    telefoon: '',
    concept: '',
    beschrijving: '',
    ruimte: '',
    stroom: '',
    social: '',
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.bedrijf.trim()) newErrors.bedrijf = 'Verplicht veld';
    if (!form.contactpersoon.trim()) newErrors.contactpersoon = 'Verplicht veld';
    if (!form.email.trim()) newErrors.email = 'Verplicht veld';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Ongeldig e-mailadres';
    if (!form.telefoon.trim()) newErrors.telefoon = 'Verplicht veld';
    if (!form.concept) newErrors.concept = 'Selecteer een type';
    if (!form.beschrijving.trim()) newErrors.beschrijving = 'Verplicht veld';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSending(true);

    const subject = encodeURIComponent(`Samenwerking aanvraag: ${form.bedrijf}`);
    const body = encodeURIComponent(
      `Naam onderneming: ${form.bedrijf}\n` +
      `Contactpersoon: ${form.contactpersoon}\n` +
      `E-mail: ${form.email}\n` +
      `Telefoon: ${form.telefoon}\n` +
      `Type concept: ${form.concept}\n` +
      `Beschrijving: ${form.beschrijving}\n` +
      `Benodigde ruimte: ${form.ruimte || 'Niet opgegeven'}\n` +
      `Stroomvereisten: ${form.stroom || 'Niet opgegeven'}\n` +
      `Social media / website: ${form.social || 'Niet opgegeven'}`
    );

    window.location.href = `mailto:info@stagenation.be?subject=${subject}&body=${body}`;

    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
    }, 500);
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full mb-6">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Bedankt!</h2>
          <p className="text-slate-400 text-lg mb-8">
            We nemen zo snel mogelijk contact met je op.
          </p>
          <button
            onClick={() => onNavigate?.('home')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-amber-500/3 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            <Store className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 text-sm font-medium tracking-wide uppercase">Partners & Standhouders</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
            Standhouders &{' '}
            <span className="text-amber-400">Foodtrucks</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Organiseer je een foodtruck, cateringconcept, dessertstand, drankconcept of merchandisingstand?
            StageNation staat open voor samenwerkingen tijdens onze evenementen en live producties.
          </p>
        </div>
      </section>

      {/* Mogelijkheden */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
            Mogelijkheden
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {MOGELIJKHEDEN.map((item) => (
              <div
                key={item.label}
                className="group relative bg-white/[0.03] border border-white/10 hover:border-amber-500/30 rounded-xl p-5 sm:p-6 text-center transition-all duration-300 hover:bg-amber-500/5"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/10 rounded-lg mb-3 group-hover:bg-amber-500/20 transition-colors">
                  <item.icon className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-white font-semibold text-sm sm:text-base mb-1">{item.label}</h3>
                <p className="text-slate-500 text-xs sm:text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formulier */}
      <section className="py-16 sm:py-20 bg-white/[0.02]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Aanvraag indienen
            </h2>
            <p className="text-slate-400">
              Vul onderstaand formulier in en we nemen contact met je op.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Naam onderneming *
                </label>
                <input
                  type="text"
                  value={form.bedrijf}
                  onChange={(e) => updateField('bedrijf', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/5 border ${errors.bedrijf ? 'border-red-500' : 'border-white/10'} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors`}
                  placeholder="Jouw bedrijf"
                />
                {errors.bedrijf && <p className="mt-1 text-xs text-red-400">{errors.bedrijf}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Contactpersoon *
                </label>
                <input
                  type="text"
                  value={form.contactpersoon}
                  onChange={(e) => updateField('contactpersoon', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/5 border ${errors.contactpersoon ? 'border-red-500' : 'border-white/10'} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors`}
                  placeholder="Naam contactpersoon"
                />
                {errors.contactpersoon && <p className="mt-1 text-xs text-red-400">{errors.contactpersoon}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  E-mailadres *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/5 border ${errors.email ? 'border-red-500' : 'border-white/10'} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors`}
                  placeholder="naam@bedrijf.be"
                />
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Telefoonnummer *
                </label>
                <input
                  type="tel"
                  value={form.telefoon}
                  onChange={(e) => updateField('telefoon', e.target.value)}
                  className={`w-full px-4 py-3 bg-white/5 border ${errors.telefoon ? 'border-red-500' : 'border-white/10'} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors`}
                  placeholder="+32 ..."
                />
                {errors.telefoon && <p className="mt-1 text-xs text-red-400">{errors.telefoon}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Type concept *
              </label>
              <select
                value={form.concept}
                onChange={(e) => updateField('concept', e.target.value)}
                className={`w-full px-4 py-3 bg-white/5 border ${errors.concept ? 'border-red-500' : 'border-white/10'} rounded-lg text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors appearance-none`}
              >
                <option value="" className="bg-slate-900">Selecteer een type...</option>
                {CONCEPT_TYPES.map(type => (
                  <option key={type} value={type} className="bg-slate-900">{type}</option>
                ))}
              </select>
              {errors.concept && <p className="mt-1 text-xs text-red-400">{errors.concept}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Beschrijving *
              </label>
              <textarea
                value={form.beschrijving}
                onChange={(e) => updateField('beschrijving', e.target.value)}
                rows={4}
                className={`w-full px-4 py-3 bg-white/5 border ${errors.beschrijving ? 'border-red-500' : 'border-white/10'} rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors resize-none`}
                placeholder="Omschrijf je concept, aanbod en ervaring..."
              />
              {errors.beschrijving && <p className="mt-1 text-xs text-red-400">{errors.beschrijving}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Benodigde ruimte
                </label>
                <input
                  type="text"
                  value={form.ruimte}
                  onChange={(e) => updateField('ruimte', e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                  placeholder="bv. 4x4m, trailer 6m"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Stroomvereisten
                </label>
                <input
                  type="text"
                  value={form.stroom}
                  onChange={(e) => updateField('stroom', e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                  placeholder="bv. 230V 16A, 400V"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Social media / website
              </label>
              <input
                type="text"
                value={form.social}
                onChange={(e) => updateField('social', e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                placeholder="Instagram, Facebook of website URL"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-black font-bold rounded-lg transition-colors text-lg uppercase tracking-wider"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Aanvraag verzenden
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
