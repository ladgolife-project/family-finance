'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type CashFlowData = {
  month: string
  income: number
  expense: number
}

type CashFlowChartProps = {
  data: CashFlowData[]
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function CashFlowChart({
  data,
}: CashFlowChartProps) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 10,
            right: 10,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
          />

          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) =>
              `${Math.round(Number(value) / 1000000)}jt`
            }
          />

          <Tooltip
            formatter={(value, name) => [
              formatRupiah(Number(value)),
              name === 'income'
                ? 'Pemasukan'
                : 'Pengeluaran',
            ]}
          />

          <Legend
            formatter={(value) =>
              value === 'income'
                ? 'Pemasukan'
                : 'Pengeluaran'
            }
          />

          <Bar
            dataKey="income"
            name="income"
            radius={[4, 4, 0, 0]}
          />

          <Bar
            dataKey="expense"
            name="expense"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}