'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ExpenseCategoryData = {
  name: string
  amount: number
}

type ExpenseCategoryChartProps = {
  data: ExpenseCategoryData[]
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function ExpenseCategoryChart({
  data,
}: ExpenseCategoryChartProps) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{
            top: 10,
            right: 20,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            type="number"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) =>
              `${Math.round(Number(value) / 1000)}K`
            }
          />

          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 12 }}
          />

          <Tooltip
            formatter={(value) => [
              formatRupiah(Number(value)),
              'Pengeluaran',
            ]}
          />

          <Bar
            dataKey="amount"
            name="Pengeluaran"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}