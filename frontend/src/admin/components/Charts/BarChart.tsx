/**
 * Composant graphique barres avec Recharts
 */
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface BarChartProps {
  data: Array<Record<string, any>>
  xAxisKey: string
  bars: Array<{ key: string; name: string; color: string }>
  height?: number
}

export function BarChart({ data, xAxisKey, bars, height = 300 }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data}>
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
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

