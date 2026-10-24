import { formatCancelDeadlineLocal } from '@flightwatcher/shared'
import { useI18n } from '../contexts/I18nContext'

interface Props {
  cancelDeadline?: string | null
  compact?: boolean
}

/** §12 B2C notices — texts from i18n (paramétrables), juriste hors code. */
export function DealComplianceNotice({ cancelDeadline, compact }: Props) {
  const { t, language } = useI18n()
  const locale = language === 'en' ? 'en-GB' : 'fr-FR'
  const localCancel = formatCancelDeadlineLocal(cancelDeadline, locale)

  return (
    <div
      className={
        compact
          ? 'text-[11px] text-slate-500 space-y-1'
          : 'text-xs text-slate-600 bg-slate-50 border border-line rounded-xl px-3 py-2.5 space-y-1.5'
      }
    >
      <p>{t('deals.legal.twoBookingsPay')}</p>
      {localCancel ? <p>{t('deals.legal.cancelLocal', { when: localCancel })}</p> : null}
      <p className="text-slate-500">{t('deals.legal.cgvNote')}</p>
    </div>
  )
}
