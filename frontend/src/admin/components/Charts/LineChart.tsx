/**
 * Composant graphique ligne avec Recharts
 */
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface LineChartProps {
  data: Array<Record<string, any>>
  dataKey?: string // Optionnel, non utilisé actuellement
  xAxisKey: string
  lines: Array<{ key: string; name: string; color: string }>
  height?: number
}

export function LineChart({ data, dataKey, xAxisKey, lines, height = 300 }: LineChartProps) {
  // Vérifier que les données sont valides
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-400">
        Aucune donnée disponible
      </div>
    )
  }

  // Formater les dates pour l'affichage
  const formattedData = data.map(item => {
    try {
      // Essayer de parser la date si c'est une string
      const dateValue = item[xAxisKey]
      if (dateValue) {
        const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
        if (date instanceof Date && !isNaN(date.getTime())) {
          return {
            ...item,
            [xAxisKey]: date.toLocaleDateString('fr-FR', { 
              month: 'short', 
              day: 'numeric' 
            })
          }
        }
      }
      // Si ce n'est pas une date valide, retourner tel quel
      return item
    } catch (error) {
      // En cas d'erreur, retourner l'item tel quel
      console.warn('Erreur formatage date:', error)
      return item
    }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis 
          dataKey={xAxisKey} 
          stroke="#9CA3AF"
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke="#9CA3AF"
          style={{ fontSize: '12px' }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#252836', 
            border: '1px solid #374151',
            borderRadius: '8px',
            color: '#F3F4F6'
          }}
        />
        <Legend 
          wrapperStyle={{ color: '#9CA3AF', fontSize: '12px' }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={{ r: 4, fill: line.color }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

