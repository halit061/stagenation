import { useState, useCallback, useRef } from 'react';
import { CreditCard, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface CheckoutFormData {
  firstName: string;
  lastName: string;
  email: string;
  emailConfirm: string;
  phone: string;
  paymentMethod: string;
  notes: string;
  termsAccepted: boolean;
}

export interface CheckoutFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailConfirm?: string;
  phone?: string;
  paymentMethod?: string;
  termsAccepted?: string;
}

interface Props {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  onChange: (field: keyof CheckoutFormData, value: string | boolean) => void;
  onValidateField: (field: keyof CheckoutFormData) => void;
}

const PAYMENT_METHODS = [
  { id: 'bancontact', label: 'Bancontact', icon: '🏦' },
  { id: 'ideal', label: 'iDEAL', icon: '🏧' },
  { id: 'creditcard', label: 'Creditcard', icon: null },
  { id: 'paypal', label: 'PayPal', icon: null },
] as const;

export function CheckoutForm({ formData, errors, onChange, onValidateField }: Props) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const firstErrorRef = useRef<HTMLDivElement>(null);

  const inputBase = 'w-full rounded-lg border px-3 py-3 text-sm bg-slate-800 text-white placeholder-slate-500 outline-none transition-colors min-h-[48px]';
  const inputNormal = `${inputBase} border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30`;
  const inputError = `${inputBase} border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/30`;

  const handleInputChange = useCallback((field: keyof CheckoutFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange(field, e.target.value);
  }, [onChange]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <h3 className="text-white font-semibold text-base">Jouw Gegevens</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-xs font-semibold text-slate-400 mb-1.5">
              Voornaam *
            </label>
            <input
              id="firstName"
              type="text"
              placeholder="Voornaam"
              value={formData.firstName}
              onChange={handleInputChange('firstName')}
              onBlur={() => onValidateField('firstName')}
              className={errors.firstName ? inputError : inputNormal}
              autoComplete="given-name"
            />
            {errors.firstName && (
              <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {errors.firstName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lastName" className="block text-xs font-semibold text-slate-400 mb-1.5">
              Achternaam *
            </label>
            <input
              id="lastName"
              type="text"
              placeholder="Achternaam"
              value={formData.lastName}
              onChange={handleInputChange('lastName')}
              onBlur={() => onValidateField('lastName')}
              className={errors.lastName ? inputError : inputNormal}
              autoComplete="family-name"
            />
            {errors.lastName && (
              <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-400 mb-1.5">
            E-mailadres *
          </label>
          <input
            id="email"
            type="email"
            placeholder="naam@voorbeeld.be"
            value={formData.email}
            onChange={handleInputChange('email')}
            onBlur={() => onValidateField('email')}
            className={errors.email ? inputError : inputNormal}
            autoComplete="email"
            inputMode="email"
          />
          {errors.email ? (
            <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors.email}
            </p>
          ) : (
            <p className="text-slate-500 text-xs mt-1">Je tickets worden naar dit e-mailadres gestuurd</p>
          )}
        </div>

        <div>
          <label htmlFor="emailConfirm" className="block text-xs font-semibold text-slate-400 mb-1.5">
            Bevestig e-mailadres *
          </label>
          <input
            id="emailConfirm"
            type="email"
            placeholder="Bevestig je e-mailadres"
            value={formData.emailConfirm}
            onChange={handleInputChange('emailConfirm')}
            onBlur={() => onValidateField('emailConfirm')}
            className={errors.emailConfirm ? inputError : inputNormal}
            autoComplete="email"
            inputMode="email"
          />
          {errors.emailConfirm && (
            <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors.emailConfirm}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-semibold text-slate-400 mb-1.5">
            Telefoonnummer
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="+32 470 00 00 00"
            value={formData.phone}
            onChange={handleInputChange('phone')}
            onBlur={() => onValidateField('phone')}
            className={errors.phone ? inputError : inputNormal}
            autoComplete="tel"
            inputMode="tel"
          />
          {errors.phone ? (
            <p className="flex items-center gap-1 text-red-400 text-xs mt-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors.phone}
            </p>
          ) : (
            <p className="text-slate-500 text-xs mt-1">Optioneel — voor contact bij wijzigingen</p>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-base">Betaalmethode</h3>

        <div className="grid grid-cols-2 gap-3">
          {PAYMENT_METHODS.map((method) => {
            const selected = formData.paymentMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => onChange('paymentMethod', method.id)}
                className={`relative flex items-center gap-2.5 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${
                  selected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                } ${!selected && formData.paymentMethod ? 'opacity-60' : ''}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center">
                  {method.icon ? (
                    <span className="text-lg">{method.icon}</span>
                  ) : (
                    <CreditCard className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-300'}`}>
                  {method.label}
                </span>
                {selected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {errors.paymentMethod && (
          <p className="flex items-center gap-1 text-red-400 text-xs">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {errors.paymentMethod}
          </p>
        )}

        <p className="text-slate-500 text-xs leading-relaxed">
          De daadwerkelijke betaling wordt verwerkt via onze beveiligde partner. Je wordt doorgestuurd na het plaatsen van je bestelling.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <button
          type="button"
          onClick={() => setNotesExpanded(!notesExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-white font-semibold text-base">Opmerkingen</h3>
          {notesExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {notesExpanded && (
          <div>
            <textarea
              id="notes"
              placeholder="Heb je speciale wensen? Bijv. rolstoeltoegankelijkheid, allergieen..."
              value={formData.notes}
              onChange={handleInputChange('notes')}
              maxLength={500}
              rows={3}
              className={`${inputNormal} resize-none`}
            />
            <p className="text-slate-500 text-xs mt-1 text-right tabular-nums">
              {formData.notes.length}/500
            </p>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5" ref={firstErrorRef}>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={formData.termsAccepted}
            onChange={(e) => onChange('termsAccepted', e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 flex-shrink-0 cursor-pointer"
          />
          <span className="text-sm text-slate-300 leading-relaxed">
            Ik ga akkoord met de{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              algemene voorwaarden
            </a>
            {' '}en het{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              privacybeleid
            </a>
          </span>
        </label>
        {errors.termsAccepted && (
          <p className="flex items-center gap-1 text-red-400 text-xs mt-2 ml-8">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {errors.termsAccepted}
          </p>
        )}
      </div>
    </div>
  );
}
