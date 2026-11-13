/**
 * Area chart — thème clair admin (fw-*).
 */
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface AreaChartProps {
  data: Array<Record<string, any>>
  xAxisKey: string
  areas: Array<{ key: string; name: string; color: string }>
  height?: number
}

function formatTick(value: unknown) {
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
    }
  } catch {
    /* keep */
  }
  return String(value ?? '')
}

export function AreaChart({ data, xAxisKey, areas, height = 280 }: AreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="fw-muted"
        style={{ height, display: 'grid', placeItems: 'center', fontSize: '0.9rem' }}
      >
        Aucune donnée sur la période
      </div>
    )
  }

  const formattedData = data.map((item) => ({
    ...item,
    [xAxisKey]: formatTick(item[xAxisKey]),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={formattedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {areas.map((area) => (
            <linearGradient key={area.key} id={`fw-grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={area.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={area.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
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
          width={40}
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
        {areas.map((area) => (
          <Area
            key={area.key}
            type="monotone"
            dataKey={area.key}
            name={area.name}
            stroke={area.color}
            strokeWidth={2}
            fill={`url(#fw-grad-${area.key})`}
            fillOpacity={1}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
