/**
 * Page de connexion — landing Compte (même style Planner / Favoris)
 */
import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AccountGuestLanding } from '../components/AccountGuestLanding'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useI18n()
  const redirectTo = searchParams.get('redirect') || '/'

  useEffect(() => {
    if (redirectTo.startsWith('/')) {
      try {
        sessionStorage.setItem('fw_post_login_redirect', redirectTo)
      } catch {
        /* ignore */
      }
    }
  }, [redirectTo])

  useEffect(() => {
    const checkUser = async () => {
      const user = await getCurrentUser()
      if (user) {
        navigate(redirectTo.startsWith('/') ? redirectTo : '/')
      }
    }
    void checkUser()
  }, [navigate, redirectTo])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-20 w-72 h-72 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-14">
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/"
            className="text-sm font-bold text-[#E85A28] hover:text-[#FF6B35]"
          >
            {t('login.back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <AccountGuestLanding />
      </div>
    </div>
  )
}
