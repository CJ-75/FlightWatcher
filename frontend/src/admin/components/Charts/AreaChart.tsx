/**
 * Composant graphique aires avec Recharts
 */
import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface AreaChartProps {
  data: Array<Record<string, any>>
  xAxisKey: string
  areas: Array<{ key: string; name: string; color: string }>
  height?: number
}

export function AreaChart({ data, xAxisKey, areas, height = 300 }: AreaChartProps) {
  // Formater les dates pour l'affichage
  const formattedData = data.map(item => ({
    ...item,
    [xAxisKey]: new Date(item[xAxisKey]).toLocaleDateString('fr-FR', { 
      month: 'short', 
      day: 'numeric' 
    })
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={formattedData}>
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
        {areas.map((area) => (
          <Area
            key={area.key}
            type="monotone"
            dataKey={area.key}
            name={area.name}
            stackId="1"
            stroke={area.color}
            fill={area.color}
            fillOpacity={0.6}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}

