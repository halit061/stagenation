import { useState, useCallback, useRef } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { st } from '../lib/seatTranslations';

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
  {
    id: 'bancontact',
    label: 'Bancontact',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="3" fill="#005498"/><text x="12" y="14" text-anchor="middle" fill="white" font-size="6" font-weight="bold" font-family="Arial">BC</text></svg>',
  },
  {
    id: 'creditcard',
    label: 'Creditcard',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="3" fill="#1a1a2e"/><rect x="1" y="8" width="22" height="3" fill="#334155"/><rect x="4" y="14" width="6" height="2" rx="1" fill="#64748b"/><rect x="14" y="14" width="3" height="2" rx="1" fill="#64748b"/></svg>',
  },
  {
    id: 'applepay',
    label: 'Apple Pay',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="3" fill="#000000"/><text x="12" y="14.5" text-anchor="middle" fill="white" font-size="7" font-weight="600" font-family="Arial"> Pay</text></svg>',
  },
  {
    id: 'googlepay',
    label: 'Google Pay',
    svg: '<svg viewBox="0 0 24 24" fill="none"><rect x="1" y="4" width="22" height="16" rx="3" fill="#ffffff" stroke="#e2e8f0"/><text x="12" y="14.5" text-anchor="middle" fill="#3c4043" font-size="6" font-weight="600" font-family="Arial">G Pay</text></svg>',
  },
] as const;

export function CheckoutForm({ formData, errors, onChange, onValidateField }: Props) {
  const { language } = useLanguage();
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
        <h3 className="text-white font-semibold text-base">{st(language, 'checkout.yourDetails')}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-xs font-semibold text-slate-400 mb-1.5">
              {st(language, 'checkout.firstName')} *
            </label>
            <input
              id="firstName"
              type="text"
              placeholder={st(language, 'checkout.firstName')}
              value={formData.firstName}
              onChange={handleInputChange('firstName')}
              onBlur={() => onValidateField('firstName')}
              className={errors.firstName ? inputError : inputNormal}
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            />
            {errors.firstName && (
              <p id="firstName-error" className="flex items-center gap-1 text-red-400 text-xs mt-1" role="alert">
                <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {errors.firstName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lastName" className="block text-xs font-semibold text-slate-400 mb-1.5">
              {st(language, 'checkout.lastName')} *
            </label>
            <input
              id="lastName"
              type="text"
              placeholder={st(language, 'checkout.lastName')}
              value={formData.lastName}
              onChange={handleInputChange('lastName')}
              onBlur={() => onValidateField('lastName')}
              className={errors.lastName ? inputError : inputNormal}
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            />
            {errors.lastName && (
              <p id="lastName-error" className="flex items-center gap-1 text-red-400 text-xs mt-1" role="alert">
                <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {errors.lastName}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-400 mb-1.5">
            {st(language, 'checkout.email')} *
          </label>
          <input
            id="email"
            type="email"
            placeholder={st(language, 'checkout.emailPlaceholder')}
            value={formData.email}
            onChange={handleInputChange('email')}
            onBlur={() => onValidateField('email')}
            className={errors.email ? inputError : inputNormal}
            autoComplete="email"
            inputMode="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : 'email-hint'}
          />
          {errors.email ? (
            <p id="email-error" className="flex items-center gap-1 text-red-400 text-xs mt-1" role="alert">
              <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              {errors.email}
            </p>
          ) : (
            <p id="email-hint" className="text-slate-500 text-xs mt-1">{st(language, 'checkout.emailHint')}</p>
          )}
        </div>

        <div>
          <label htmlFor="emailConfirm" className="block text-xs font-semibold text-slate-400 mb-1.5">
            {st(language, 'checkout.confirmEmail')} *
          </label>
          <input
            id="emailConfirm"
            type="email"
            placeholder={st(language, 'checkout.confirmEmailPlaceholder')}
            value={formData.emailConfirm}
            onChange={handleInputChange('emailConfirm')}
            onBlur={() => onValidateField('emailConfirm')}
            className={errors.emailConfirm ? inputError : inputNormal}
            autoComplete="email"
            inputMode="email"
            aria-invalid={!!errors.emailConfirm}
            aria-describedby={errors.emailConfirm ? 'emailConfirm-error' : undefined}
          />
          {errors.emailConfirm && (
            <p id="emailConfirm-error" className="flex items-center gap-1 text-red-400 text-xs mt-1" role="alert">
              <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              {errors.emailConfirm}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-semibold text-slate-400 mb-1.5">
            {st(language, 'checkout.phone')}
          </label>
          <input
            id="phone"
            type="tel"
            placeholder={st(language, 'checkout.phonePlaceholder')}
            value={formData.phone}
            onChange={handleInputChange('phone')}
            onBlur={() => onValidateField('phone')}
            className={errors.phone ? inputError : inputNormal}
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-error' : 'phone-hint'}
          />
          {errors.phone ? (
            <p id="phone-error" className="flex items-center gap-1 text-red-400 text-xs mt-1" role="alert">
              <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
              {errors.phone}
            </p>
          ) : (
            <p id="phone-hint" className="text-slate-500 text-xs mt-1">{st(language, 'checkout.phoneHint')}</p>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-base">{st(language, 'checkout.paymentMethod')}</h3>

        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={st(language, 'checkout.paymentMethod')}>
          {PAYMENT_METHODS.map((method) => {
            const selected = formData.paymentMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange('paymentMethod', method.id)}
                className={`relative flex items-center gap-2.5 px-4 py-3.5 rounded-xl border-2 transition-all text-left focus-ring ${
                  selected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                } ${!selected && formData.paymentMethod ? 'opacity-60' : ''}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
                  <div dangerouslySetInnerHTML={{ __html: method.svg }} className="w-8 h-8" />
                </div>
                <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-300'}`}>
                  {method.label}
                </span>
                {selected && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
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
          <p className="flex items-center gap-1 text-red-400 text-xs" role="alert">
            <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {errors.paymentMethod}
          </p>
        )}

        <p className="text-slate-500 text-xs leading-relaxed">
          {st(language, 'checkout.paymentSecure')}
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <button
          type="button"
          onClick={() => setNotesExpanded(!notesExpanded)}
          className="flex items-center justify-between w-full text-left focus-ring rounded-lg"
          aria-expanded={notesExpanded}
        >
          <h3 className="text-white font-semibold text-base">{st(language, 'checkout.notes')}</h3>
          {notesExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
          )}
        </button>

        {notesExpanded && (
          <div>
            <textarea
              id="notes"
              placeholder={st(language, 'checkout.notesPlaceholder')}
              value={formData.notes}
              onChange={handleInputChange('notes')}
              maxLength={500}
              rows={3}
              className={`${inputNormal} resize-none`}
            />
            <p className="text-slate-500 text-xs mt-1 text-right tabular-nums" aria-live="polite">
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
            aria-invalid={!!errors.termsAccepted}
          />
          <span className="text-sm text-slate-300 leading-relaxed">
            {st(language, 'checkout.termsAgree')}{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {st(language, 'checkout.termsLink')}
            </a>
            {' '}{st(language, 'checkout.termsAnd')}{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {st(language, 'checkout.privacyLink')}
            </a>
          </span>
        </label>
        {errors.termsAccepted && (
          <p className="flex items-center gap-1 text-red-400 text-xs mt-2 ml-8" role="alert">
            <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {errors.termsAccepted}
          </p>
        )}
      </div>
    </div>
  );
}
