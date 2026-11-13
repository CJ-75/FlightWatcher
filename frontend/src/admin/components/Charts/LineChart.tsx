/**
 * Line chart — thème clair admin (fw-*).
 */
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface LineChartProps {
  data: Array<Record<string, any>>
  dataKey?: string
  xAxisKey: string
  lines: Array<{ key: string; name: string; color: string }>
  height?: number
}

function formatTick(value: unknown, xAxisKey: string) {
  if (xAxisKey === 'day' || xAxisKey === 'date' || xAxisKey.endsWith('_at')) {
    try {
      const date = typeof value === 'string' ? new Date(value) : value
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
      }
    } catch {
      /* keep raw */
    }
  }
  return String(value ?? '')
}

export function LineChart({ data, xAxisKey, lines, height = 280 }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="fw-muted"
        style={{
          height,
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.9rem',
        }}
      >
        Aucune donnée sur la période
      </div>
    )
  }

  const formattedData = data.map((item) => ({
    ...item,
    [xAxisKey]: formatTick(item[xAxisKey], xAxisKey),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={formattedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,18,14,0.08)" vertical={false} />
        <XAxis
          dataKey={xAxisKey}
          stroke="#c4a794"
          tick={{ fill: '#8a6a58', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(26,18,14,0.1)' }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#c4a794"
          tick={{ fill: '#8a6a58', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #f0e0d4',
            borderRadius: 12,
            color: '#1a120e',
            boxShadow: '0 12px 32px rgba(92,46,24,0.08)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ color: '#8a6a58', fontSize: 12, paddingTop: 8 }} />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
