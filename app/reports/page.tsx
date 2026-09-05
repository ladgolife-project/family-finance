import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CashFlowChart from '@/components/cash-flow-chart'
import ExpenseCategoryChart from '@/components/expense-category-chart'

type PageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getMonthRange(monthParam?: string) {
  const now = new Date()

  const selectedMonth =
    monthParam &&
    /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, '0')}`

  const [year, month] =
    selectedMonth.split('-').map(Number)

  const startDate = `${year}-${String(month).padStart(
    2,
    '0'
  )}-01`

  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(
          2,
          '0'
        )}-01`

  return {
    selectedMonth,
    startDate,
    nextMonth,
  }
}

export default async function ReportsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  const {
    selectedMonth,
    startDate,
    nextMonth,
  } = getMonthRange(params.month)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/')
  }

  const familyId = membership.family_id

  const selectedDate = new Date(
    Number(selectedMonth.slice(0, 4)),
    Number(selectedMonth.slice(5, 7)) - 1,
    1
  )

  const sixMonthStartDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() - 5,
    1
  )

  const sixMonthStart = `${sixMonthStartDate.getFullYear()}-${String(
    sixMonthStartDate.getMonth() + 1
  ).padStart(2, '0')}-01`

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      type,
      amount,
      transaction_date,
      description,
      category_id,
      account_id
    `)
    .eq('family_id', familyId)
    .gte('transaction_date', sixMonthStart)
    .lt('transaction_date', nextMonth)
    .order('transaction_date', {
      ascending: false,
    })

  const currentMonthTransactions =
    (transactions ?? []).filter(
      (transaction) =>
        transaction.transaction_date >= startDate &&
        transaction.transaction_date < nextMonth
  )

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .eq('family_id', familyId)

  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, category_id, amount')
    .eq('family_id', familyId)
    .eq('month', startDate)
    .eq('is_active', true)

  const categoryMap = new Map(
    (categories ?? []).map((category) => [
      category.id,
      category.name,
    ])
  )

  const income = (transactions ?? [])
    .filter(
      (transaction) =>
        transaction.type === 'income'
    )
    .reduce(
      (total, transaction) =>
        total + Number(transaction.amount),
      0
    )

  const expense = (transactions ?? [])
    .filter(
      (transaction) =>
        transaction.type === 'expense'
    )
    .reduce(
      (total, transaction) =>
        total + Number(transaction.amount),
      0
    )

  const cashFlow = income - expense

  const monthlyCashFlow = Array.from(
    { length: 6 },
    (_, index) => {
      const date = new Date(
        Number(selectedMonth.slice(0, 4)),
        Number(selectedMonth.slice(5, 7)) - 1 - (5 - index),
        1
      )

      const year = date.getFullYear()
      const month = date.getMonth() + 1

      const monthStart = `${year}-${String(month).padStart(
        2,
        '0'
      )}-01`

      const nextDate = new Date(
        year,
        month,
        1
      )

      const nextYear = nextDate.getFullYear()
      const nextMonthNumber =
        nextDate.getMonth() + 1

      const monthEnd = `${nextYear}-${String(
        nextMonthNumber
      ).padStart(2, '0')}-01`

      const monthTransactions =
        (transactions ?? []).filter(
          (transaction) =>
            transaction.transaction_date >=
              monthStart &&
            transaction.transaction_date <
              monthEnd
        )

      const monthIncome =
        monthTransactions
          .filter(
            (transaction) =>
              transaction.type === 'income'
          )
          .reduce(
            (total, transaction) =>
              total + Number(transaction.amount),
            0
          )

      const monthExpense =
        monthTransactions
          .filter(
            (transaction) =>
              transaction.type === 'expense'
          )
          .reduce(
            (total, transaction) =>
              total + Number(transaction.amount),
            0
          )

      return {
        month: `${year}-${String(month).padStart(
          2,
          '0'
        )}`,
        income: monthIncome,
        expense: monthExpense,
        cashFlow: monthIncome - monthExpense,
      }
    }
  )

  const totalBudget =
    (budgets ?? []).reduce(
      (total, budget) =>
        total + Number(budget.amount ?? 0),
      0
    )

  const totalBudgetUsed = expense

  const budgetRemaining =
    totalBudget - expense

  const budgetPercentage =
    totalBudget > 0
      ? (expense / totalBudget) * 100
      : 0

  const categoryTotals = new Map<
    string,
    number
  >()

  for (const transaction of transactions ?? []) {
    if (transaction.type !== 'expense') {
      continue
    }

    const categoryName =
      categoryMap.get(transaction.category_id) ??
      'Tanpa Kategori'

    const current =
      categoryTotals.get(categoryName) ?? 0

    categoryTotals.set(
      categoryName,
      current + Number(transaction.amount)
    )
  }

  const categoryReport = Array.from(
    categoryTotals.entries()
  )
    .map(([name, amount]) => ({
      name,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  const topCategory = categoryReport[0]

  const budgetUsedPercentage =
    totalBudget > 0
      ? (totalBudgetUsed / totalBudget) * 100
      : 0

  const insightMessages: string[] = []

  if (expense === 0) {
    insightMessages.push(
      'Belum ada pengeluaran pada periode ini.'
    )
  } else if (topCategory) {
    insightMessages.push(
      `Pengeluaran terbesar berasal dari kategori ${topCategory.name} sebesar ${formatRupiah(
        topCategory.amount
      )}.`
    )
  }

  if (totalBudget > 0) {
    if (totalBudgetUsed > totalBudget) {
      insightMessages.push(
        `Pengeluaran sudah melebihi total budget sebesar ${formatRupiah(
          totalBudgetUsed - totalBudget
        )}.`
      )
    } else {
      insightMessages.push(
        `Sisa total budget saat ini sebesar ${formatRupiah(
          totalBudget - totalBudgetUsed
        )}.`
      )
    }

    insightMessages.push(
      `Budget telah terpakai ${budgetUsedPercentage.toFixed(
        1
      )}%.`
    )
  }

  if (cashFlow > 0) {
    insightMessages.push(
      `Cash flow bulan ini positif sebesar ${formatRupiah(
        cashFlow
      )}.`
    )
  } else if (cashFlow < 0) {
    insightMessages.push(
      `Cash flow bulan ini negatif sebesar ${formatRupiah(
        Math.abs(cashFlow)
      )}.`
    )
  } else {
    insightMessages.push(
      'Cash flow bulan ini berada di posisi seimbang.'
    )
  }

  const budgetCategoryReport = (budgets ?? [])
    .map((budget) => {
      const budgetAmount = Number(budget.amount ?? 0)

      const spent =
        categoryTotals.get(
          categoryMap.get(budget.category_id) ??
            'Tanpa Kategori'
        ) ?? 0

      const remaining = budgetAmount - spent

      const percentage =
        budgetAmount > 0
          ? (spent / budgetAmount) * 100
          : 0

      return {
        categoryName:
          categoryMap.get(budget.category_id) ??
          'Tanpa Kategori',
        budgetAmount,
        spent,
        remaining,
        percentage,
      }
    })
    .sort((a, b) => b.spent - a.spent)

  const topTransactions = [
    ...(transactions ?? []),
  ]
    .sort(
      (a, b) =>
        Number(b.amount) - Number(a.amount)
    )
    .slice(0, 5)

  const monthLabel = new Intl.DateTimeFormat(
    'id-ID',
    {
      month: 'long',
      year: 'numeric',
    }
  ).format(
    new Date(
      Number(selectedMonth.slice(0, 4)),
      Number(selectedMonth.slice(5, 7)) - 1,
      1
    )
  )

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-700">
      <div className="mx-auto max-w-6xl">

        <div>
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-black"
          >
            ← Kembali ke Dashboard
          </a>

          <h1 className="mt-4 text-3xl font-bold">
            Laporan Keuangan
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Ringkasan keuangan keluarga
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form
            method="GET"
            className="flex items-center gap-2"
          >
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            />

            <button
              type="submit"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Terapkan
            </button>
          </form>

          <a
            href={`/reports/export?month=${selectedMonth}`}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Export CSV
          </a>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold">
            {monthLabel}
          </h2>

          <p className="text-sm text-gray-500">
            {transactions?.length ?? 0} transaksi
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Pemasukan
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatRupiah(income)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Pengeluaran
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatRupiah(expense)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Cash Flow
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatRupiah(cashFlow)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Budget
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatRupiah(totalBudget)}
            </p>

            <p
              className={`mt-1 text-xs ${
                budgetRemaining < 0
                  ? 'text-red-600'
                  : 'text-gray-400'
              }`}
            >
              {totalBudget > 0
                ? `${budgetPercentage.toFixed(1)}% terpakai`
                : 'Belum ada budget'}
            </p>
          </div>

        </div>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">
                Budget vs Realisasi
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Perbandingan budget dengan pengeluaran aktual pada {monthLabel}.
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                budgetPercentage > 100
                  ? 'bg-red-100 text-red-700'
                  : budgetPercentage >= 90
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
              }`}
            >
              {totalBudget > 0
                ? `${budgetPercentage.toFixed(1)}%`
                : 'Belum ada budget'}
            </span>
          </div>

          {totalBudget > 0 ? (
            <>
              <div className="mt-6 h-4 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${
                    budgetPercentage > 100
                      ? 'bg-red-500'
                      : budgetPercentage >= 90
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      budgetPercentage,
                      100
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500">
                    Total Budget
                  </p>

                  <p className="mt-1 font-semibold">
                    {formatRupiah(totalBudget)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Realisasi
                  </p>

                  <p className="mt-1 font-semibold">
                    {formatRupiah(expense)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    {budgetRemaining < 0
                      ? 'Melebihi Budget'
                      : 'Sisa Budget'}
                  </p>

                  <p
                    className={`mt-1 font-semibold ${
                      budgetRemaining < 0
                        ? 'text-red-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {formatRupiah(
                      Math.abs(budgetRemaining)
                    )}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-500">
                Belum ada budget untuk {monthLabel}.
              </p>

              <a
                href="/budgets/new"
                className="mt-2 inline-block text-sm font-medium underline"
              >
                Tambah budget
              </a>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold">
              Budget per Kategori
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Perbandingan anggaran dan realisasi setiap kategori.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {budgetCategoryReport.length === 0 ? (
              <p className="text-sm text-gray-500">
                Belum ada budget untuk {monthLabel}.
              </p>
            ) : (
              budgetCategoryReport.map((item) => (
                <div key={item.categoryName}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {item.categoryName}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {formatRupiah(item.spent)} dari{' '}
                        {formatRupiah(item.budgetAmount)}
                      </p>
                    </div>

                    <span
                      className={`text-sm font-semibold ${
                        item.percentage > 100
                          ? 'text-red-600'
                          : item.percentage >= 90
                            ? 'text-yellow-600'
                            : 'text-gray-700'
                      }`}
                    >
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${
                        item.percentage > 100
                          ? 'bg-red-500'
                          : item.percentage >= 90
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          item.percentage,
                          100
                        )}%`,
                      }}
                    />
                  </div>

                  <p
                    className={`mt-2 text-xs ${
                      item.remaining < 0
                        ? 'text-red-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {item.remaining < 0
                      ? `Melebihi budget ${formatRupiah(
                          Math.abs(item.remaining)
                        )}`
                      : `Sisa ${formatRupiah(item.remaining)}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-bold">
              Cash Flow 6 Bulan
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Perbandingan pemasukan dan pengeluaran selama 6 bulan terakhir.
            </p>
          </div>

          <CashFlowChart data={monthlyCashFlow} />
        </div>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold">
              Insight Keuangan
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Ringkasan kondisi keuangan pada {monthLabel}.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {insightMessages.map((message, index) => (
              <div
                key={index}
                className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
              >
                {message}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">

          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold">
                Grafik Pengeluaran per Kategori
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Distribusi pengeluaran berdasarkan kategori pada {monthLabel}.
              </p>
            </div>

            {categoryReport.length === 0 ? (
              <p className="text-sm text-gray-500">
                Belum ada pengeluaran pada periode ini.
              </p>
            ) : (
              <ExpenseCategoryChart data={categoryReport} />
            )}
          </div>
          
          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="text-lg font-bold">
              Pengeluaran per Kategori
            </h2>

            <div className="mt-5 space-y-4">

              {categoryReport.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Belum ada pengeluaran pada periode ini.
                </p>
              ) : (
                categoryReport.map(
                  (category) => (
                    <div
                      key={category.name}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm">
                        {category.name}
                      </span>

                      <span className="text-sm font-semibold">
                        {formatRupiah(
                          category.amount
                        )}
                      </span>
                    </div>
                  )
                )
              )}

            </div>

          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">

            <h2 className="text-lg font-bold">
              Transaksi Terbesar
            </h2>

            <div className="mt-5 space-y-4">

              {topTransactions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Belum ada transaksi.
                </p>
              ) : (
                topTransactions.map(
                  (transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between gap-4"
                    >

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {transaction.description ||
                            'Tanpa keterangan'}
                        </p>

                        <p className="text-xs text-gray-500">
                          {categoryMap.get(
                            transaction.category_id
                          ) ??
                            'Tanpa kategori'}
                        </p>
                      </div>

                      <span className="whitespace-nowrap text-sm font-semibold">
                        {formatRupiah(
                          Number(
                            transaction.amount
                          )
                        )}
                      </span>

                    </div>
                  )
                )
              )}

            </div>

          </section>

        </div>

      </div>
    </main>
  )
}