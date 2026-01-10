/**
 * Page de tests - Injection de fausses données
 */
import { useTestMode } from '../context/TestModeContext'
import { StatsCard } from '../components/StatsCard'
import { toast } from 'react-hot-toast'

export function TestsPage() {
  const { isTestMode, toggleTestMode } = useTestMode()

  const handleToggle = () => {
    toggleTestMode()
    toast.success(
      isTestMode 
        ? 'Mode test désactivé - Données réelles chargées' 
        : 'Mode test activé - Données mockées chargées',
      {
        duration: 3000,
        icon: isTestMode ? '✅' : '🧪'
      }
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Tests</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      {/* Toggle principal */}
      <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Mode Test</h2>
            <p className="text-gray-400 text-sm">
              {isTestMode 
                ? 'Les données mockées sont actuellement utilisées. Aucune modification ne sera effectuée sur Supabase.'
                : 'Les données réelles de Supabase sont utilisées. Activez le mode test pour utiliser des données mockées.'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-14 w-28 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-[#252836] ${
              isTestMode ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-12 w-12 transform rounded-full bg-white transition-transform ${
                isTestMode ? 'translate-x-14' : 'translate-x-1'
              }`}
            />
            <span className="absolute inset-0 flex items-center justify-between px-3">
              <span className={`text-xs font-medium ${isTestMode ? 'text-white' : 'text-gray-400'}`}>
                OFF
              </span>
              <span className={`text-xs font-medium ${isTestMode ? 'text-white' : 'text-gray-400'}`}>
                ON
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Informations sur les données mockées */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Utilisateurs mockés"
          value={50}
          icon="👥"
          subtitle="Données de test disponibles"
        />
        <StatsCard
          title="Recherches mockées"
          value={100}
          icon="🔍"
          subtitle="Données de test disponibles"
        />
        <StatsCard
          title="Événements SAS mockés"
          value={200}
          icon="📊"
          subtitle="Données de test disponibles"
        />
        <StatsCard
          title="Plans mockés"
          value={3}
          icon="💳"
          subtitle="Free, Basic, Premium"
        />
      </div>

      {/* Indicateur de statut */}
      <div className={`rounded-xl border p-4 ${
        isTestMode 
          ? 'bg-green-600/20 border-green-600/30' 
          : 'bg-gray-700/20 border-gray-700/30'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            isTestMode ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
          }`}></div>
          <div>
            <p className="text-sm font-medium text-white">
              {isTestMode ? 'Mode Test Actif' : 'Mode Production'}
            </p>
            <p className="text-xs text-gray-400">
              {isTestMode 
                ? 'Les pages Users, Searches et Activated utilisent des données mockées'
                : 'Toutes les pages utilisent les données réelles de Supabase'}
            </p>
          </div>
        </div>
      </div>

      {/* Détails des données mockées */}
      <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Détails des données mockées</h2>
        <div className="space-y-4">
          <div className="border-l-4 border-blue-600 pl-4">
            <h3 className="font-semibold text-white mb-2">Utilisateurs</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• 50 utilisateurs avec profils complets</li>
              <li>• Statistiques de recherches, favoris et événements</li>
              <li>• Dates d'inscription variées (0-90 jours)</li>
              <li>• Aéroports de départ variés</li>
            </ul>
          </div>

          <div className="border-l-4 border-green-600 pl-4">
            <h3 className="font-semibold text-white mb-2">Recherches (Searches)</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• 100 recherches sauvegardées</li>
              <li>• Budgets variés (100-500€)</li>
              <li>• Auto-check activé pour 1/3 des recherches</li>
              <li>• Dates de création variées (0-60 jours)</li>
              <li>• Graphiques : volume par jour, répartition par aéroport</li>
              <li>• Statistiques complètes disponibles</li>
            </ul>
          </div>

          <div className="border-l-4 border-yellow-600 pl-4">
            <h3 className="font-semibold text-white mb-2">Activated (Booking SAS)</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• 200 événements de clics</li>
              <li>• 4 partenaires différents (Ryanair, Skyscanner, Kayak, Expedia)</li>
              <li>• Prix variés (50-500€)</li>
              <li>• Mix d'utilisateurs connectés et anonymes</li>
              <li>• Graphiques : clics par jour, répartition par partenaire</li>
              <li>• Statistiques : utilisateurs uniques, taux de conversion</li>
            </ul>
          </div>

          <div className="border-l-4 border-purple-600 pl-4">
            <h3 className="font-semibold text-white mb-2">Plans</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• 3 plans : Free, Basic, Premium</li>
              <li>• Prix et limites configurés</li>
              <li>• Tous actifs par défaut</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Avertissement */}
      {isTestMode && (
        <div className="bg-yellow-600/20 border border-yellow-600/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="font-semibold text-yellow-400 mb-1">Mode Test Actif</h3>
              <p className="text-sm text-yellow-300/80">
                Toutes les données affichées sont mockées. Aucune modification ne sera effectuée sur Supabase.
                Les actions (modification, suppression, etc.) seront simulées mais ne modifieront pas la base de données réelle.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

