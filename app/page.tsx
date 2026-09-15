import { createClient } from '@/lib/supabase/server'
import CashFlowChart from '@/components/cash-flow-chart'
import Link from 'next/link'

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getCurrentMonth() {
  const now = new Date()

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function getMonthRange(monthParam: string) {
  const [year, month] = monthParam.split('-').map(Number)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    const currentMonth = getCurrentMonth()

    return getMonthRange(currentMonth)
  }

  const nextYear =
    month === 12 ? year + 1 : year

  const nextMonth =
    month === 12 ? 1 : month + 1

  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    year,
    month,
  }
}

function getPreviousMonth(
  year: number,
  month: number,
  offset: number
) {
  const date = new Date(
    year,
    month - 1 - offset,
    1
  )

  const nextDate = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    1
  )

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,

    startDate: `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}-01`,

    endDate: `${nextDate.getFullYear()}-${String(
      nextDate.getMonth() + 1
    ).padStart(2, '0')}-01`,

    date,
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string
  }>
}) {
  const supabase = await createClient()

  const params = await searchParams

  const selectedMonth =
    params.month ?? getCurrentMonth()

  const monthRange =
    getMonthRange(selectedMonth)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-700">
            Belum Login
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Silakan login untuk melihat dashboard.
          </p>

          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-black px-5 py-3 text-sm font-medium text-white"
          >
            Masuk
          </Link>
        </div>
      </main>
    )
  }

  // ============================================================
  // FAMILY
  // ============================================================

  const { data: membership } = await supabase
    .from('family_members')
    .select(`
      family_id,
      role,
      families (
        id,
        name
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!membership?.family_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-700">
            Keluarga belum ditemukan
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            User belum terhubung dengan keluarga.
          </p>
        </div>
      </main>
    )
  }

  const familyId = membership.family_id

  const family = Array.isArray(membership.families)
    ? membership.families[0]
    : membership.families

  // ============================================================
  // ACCOUNTS
  // ============================================================

  const { data: accountData, error: accountError } =
    await supabase
      .from('account_balances')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('account_name')

  if (accountError) {
    console.error(
      'Gagal mengambil saldo rekening:',
      accountError
    )
  }

  const accounts = accountData ?? []

  // ============================================================
  // FINANCIAL GOALS
  // ============================================================

  const { data: financialGoals } =
    await supabase
      .from('financial_goals')
      .select(`
        id,
        name,
        target_amount,
        current_amount,
        deadline
      `)
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('deadline', {
        ascending: true,
      })
      .limit(3)

  // ============================================================
  // GOAL CONTRIBUTIONS / DANA CADANGAN
  // ============================================================

  const { data: goalContributions, error: goalContributionError } =
    await supabase
      .from('financial_goal_contributions')
      .select(`
        account_id,
        amount
      `)
      .eq('family_id', familyId)

  if (goalContributionError) {
    console.error(
      'Gagal mengambil dana goal:',
      goalContributionError
    )
  }

  // Total dana goal per rekening
  const allocatedByAccount: Record<string, number> = {}

  for (const contribution of goalContributions ?? []) {
    const accountId = contribution.account_id
    const amount = Number(contribution.amount ?? 0)

    allocatedByAccount[accountId] =
      (allocatedByAccount[accountId] ?? 0) + amount
  }

  // ============================================================
  // TOTAL SALDO & DANA TERSEDIA
  // ============================================================

  const totalSaldo = accounts.reduce(
    (total, account) =>
      total + Number(account.balance ?? 0),
    0
  )

  const totalDanaGoal = accounts.reduce(
    (total, account) =>
      total +
      (allocatedByAccount[account.account_id] ?? 0),
    0
  )

  const totalSaldoTersedia =
    totalSaldo - totalDanaGoal

  // ============================================================
  // TRANSACTIONS BULAN TERPILIH
  // ============================================================

  const {
    data: monthlyTransactions,
  } = await supabase
    .from('transactions')
    .select(`
      id,
      type,
      amount,
      category_id,
      transaction_date
    `)
    .eq('family_id', familyId)
    .gte(
      'transaction_date',
      monthRange.startDate
    )
    .lt(
      'transaction_date',
      monthRange.endDate
    )

  // ============================================================
  // BUDGET
  // ============================================================

  const { data: budgets } =
  await supabase
    .from('budgets')
    .select(`
      id,
      category_id,
      amount
    `)
    .eq('family_id', familyId)
    .eq('is_active', true)

  // ============================================================
  // RINGKASAN BULANAN
  // ============================================================

  const pemasukanBulanIni =
    monthlyTransactions
      ?.filter(
        (transaction) =>
          transaction.type === 'income'
      )
      .reduce(
        (total, transaction) =>
          total + Number(transaction.amount),
        0
      ) ?? 0

  const totalPengeluaranBulanIni =
    monthlyTransactions
      ?.filter(
        (transaction) =>
          transaction.type === 'expense'
      )
      .reduce(
        (total, transaction) =>
          total + Number(transaction.amount),
        0
      ) ?? 0

  const cashFlowBulanIni =
    pemasukanBulanIni -
    totalPengeluaranBulanIni

  const savingsRate =
    pemasukanBulanIni > 0
      ? (cashFlowBulanIni / pemasukanBulanIni) * 100
      : 0

  const selectedDate = new Date(
    `${selectedMonth}-01T00:00:00`
  )

  const selectedMonthLabel =
    new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
    }).format(selectedDate)

  const previousMonthRange = getPreviousMonth(
    monthRange.year,
    monthRange.month,
    1
  )

  const previousMonth =
    `${previousMonthRange.year}-${String(
      previousMonthRange.month
    ).padStart(2, '0')}`

  const previousStartDate =
    previousMonthRange.startDate

  const previousEndDate =
    monthRange.startDate

  const { data: previousTransactions } = await supabase
    .from('transactions')
    .select(`
      type,
      amount,
      category_id
    `)
    .eq('family_id', familyId)
    .gte('transaction_date', previousStartDate)
    .lt('transaction_date', previousEndDate)

  const pemasukanBulanLalu =
    previousTransactions
      ?.filter(
        (transaction) =>
          transaction.type === 'income'
      )
      .reduce(
        (total, transaction) =>
          total + Number(transaction.amount),
        0
      ) ?? 0

  const pengeluaranBulanLalu =
    previousTransactions
      ?.filter(
        (transaction) =>
          transaction.type === 'expense'
      )
      .reduce(
        (total, transaction) =>
          total + Number(transaction.amount),
        0
      ) ?? 0

  const cashFlowBulanLalu =
    pemasukanBulanLalu - pengeluaranBulanLalu

  function calculateChange(
    current: number,
    previous: number
  ) {
    if (previous === 0) {
      return current === 0 ? 0 : null
    }

    return ((current - previous) / previous) * 100
  }

  const incomeChange = calculateChange(
    pemasukanBulanIni,
    pemasukanBulanLalu
  )

  const expenseChange = calculateChange(
    totalPengeluaranBulanIni,
    pengeluaranBulanLalu
  )

  const cashFlowChange = calculateChange(
    cashFlowBulanIni,
    cashFlowBulanLalu
  )

  // ============================================================
  // BUDGET CALCULATION
  // ============================================================

  const budgetCategoryIds = new Set(
    (budgets ?? []).map(
      (budget) => budget.category_id
    )
  )

  const pengeluaranBudgetBulanIni =
    monthlyTransactions
      ?.filter(
        (transaction) =>
          transaction.type === 'expense' &&
          budgetCategoryIds.has(
            transaction.category_id
          )
      )
      .reduce(
        (total, transaction) =>
          total + Number(transaction.amount),
        0
      ) ?? 0

  const totalBudget =
    (budgets ?? []).reduce(
      (total, budget) =>
        total + Number(budget.amount ?? 0),
      0
    )

  const totalBudgetRemaining =
    totalBudget -
    pengeluaranBudgetBulanIni

  const budgetPercentage =
    totalBudget > 0
      ? (pengeluaranBudgetBulanIni /
          totalBudget) *
        100
      : 0

  const budgetCategories =
    budgetCategoryIds.size > 0
      ? (
          await supabase
            .from('categories')
            .select('id, name')
            .eq('family_id', familyId)
            .in(
              'id',
              Array.from(budgetCategoryIds)
            )
        ).data ?? []
      : []

  const budgetVsActual =
    (budgets ?? [])
      .map((budget) => {
        const budgetAmount =
          Number(budget.amount ?? 0)

        const actual =
          monthlyTransactions
            ?.filter(
              (transaction) =>
                transaction.type === 'expense' &&
                transaction.category_id ===
                  budget.category_id
            )
            .reduce(
              (total, transaction) =>
                total +
                Number(transaction.amount ?? 0),
              0
            ) ?? 0

        const remaining =
          budgetAmount - actual

        const percentage =
          budgetAmount > 0
            ? (actual / budgetAmount) * 100
            : 0

        const category =
          budgetCategories.find(
            (item) =>
              item.id === budget.category_id
          )

        return {
          id: budget.id,
          categoryName:
            category?.name ??
            'Tanpa kategori',
          budget: budgetAmount,
          actual,
          remaining,
          percentage,
        }
      })
      .sort(
        (a, b) =>
          b.percentage - a.percentage
      )

  // ============================================================
  // SPENDING ANALYSIS
  // ============================================================

  const { data: expenseTransactions } =
    await supabase
      .from('transactions')
      .select(`
        amount,
        category_id,
        categories (
          name
        )
      `)
      .eq('family_id', familyId)
      .eq('type', 'expense')
      .gte(
        'transaction_date',
        monthRange.startDate
      )
      .lt(
        'transaction_date',
        monthRange.endDate
      )

  const categoryTotals: Record<string, number> = {}

  expenseTransactions?.forEach(
    (transaction: any) => {
      const categoryName =
        transaction.categories?.name ??
        'Lainnya'

      categoryTotals[categoryName] =
        (categoryTotals[categoryName] ?? 0) +
        Number(transaction.amount ?? 0)
    }
  )

  const expenseByCategory =
    Object.entries(categoryTotals)
      .sort(
        (a, b) => b[1] - a[1]
      )

  const previousCategoryTotals: Record<
    string,
    number
  > = {}

  const previousExpenseTransactions =
    previousTransactions?.filter(
      (transaction) =>
        transaction.type === 'expense'
    ) ?? []

  if (
    previousExpenseTransactions.length > 0
  ) {
    const previousCategoryIds = [
      ...new Set(
        previousExpenseTransactions
          .map(
            (transaction) =>
              transaction.category_id
          )
          .filter(Boolean)
      ),
    ]

    if (previousCategoryIds.length > 0) {
      const {
        data: previousCategories,
      } = await supabase
        .from('categories')
        .select('id, name')
        .eq('family_id', familyId)
        .in(
          'id',
          previousCategoryIds
        )

      previousExpenseTransactions.forEach(
        (transaction) => {
          const category =
            previousCategories?.find(
              (item) =>
                item.id ===
                transaction.category_id
            )

          const categoryName =
            category?.name ?? 'Lainnya'

          previousCategoryTotals[
            categoryName
          ] =
            (previousCategoryTotals[
              categoryName
            ] ?? 0) +
            Number(transaction.amount ?? 0)
        }
      )
    }
  }

  const spendingAnalysis =
    expenseByCategory.map(
      ([categoryName, amount]) => {
        const currentAmount =
          Number(amount)

        const previousAmount =
          previousCategoryTotals[
            categoryName
          ] ?? 0

        const contribution =
          totalPengeluaranBulanIni > 0
            ? (currentAmount /
                totalPengeluaranBulanIni) *
              100
            : 0

        const change =
          previousAmount > 0
            ? ((currentAmount -
                previousAmount) /
                previousAmount) *
              100
            : currentAmount > 0
              ? null
              : 0

        return {
          categoryName,
          amount: currentAmount,
          previousAmount,
          contribution,
          change,
        }
      }
    )

  const topSpendingCategory =
    spendingAnalysis[0] ?? null

  const allCategoryNames = [
    ...new Set([
      ...Object.keys(categoryTotals),
      ...Object.keys(previousCategoryTotals),
    ]),
  ]

  const spendingComparison = allCategoryNames
    .map((categoryName) => {
      const currentAmount = categoryTotals[categoryName] ?? 0
      const previousAmount = previousCategoryTotals[categoryName] ?? 0
      const changeAmount = currentAmount - previousAmount

      const changePercentage =
        previousAmount > 0
          ? (changeAmount / previousAmount) * 100
          : currentAmount > 0
            ? null
            : 0

      return {
        categoryName,
        currentAmount,
        previousAmount,
        changeAmount,
        changePercentage,
      }
    })
    .filter((item) => item.changeAmount !== 0)

  const increasedCategories = spendingComparison
    .filter((item) => item.changeAmount > 0)
    .sort((a, b) => b.changeAmount - a.changeAmount)

  const decreasedCategories = spendingComparison
    .filter((item) => item.changeAmount < 0)
    .sort((a, b) => a.changeAmount - b.changeAmount)

  const topIncreasedCategory = increasedCategories[0] ?? null
  const topDecreasedCategory = decreasedCategories[0] ?? null

  const financialInsights: {
    type: "positive" | "warning" | "negative"
    title: string
    description: string
  }[] = []

  if (cashFlowBulanIni > 0) {
    financialInsights.push({
      type: "positive",
      title: "Cash flow positif",
      description: `Bulan ini pemasukan lebih besar daripada pengeluaran sebesar ${formatRupiah(
        cashFlowBulanIni
      )}.`,
    })
  } else if (cashFlowBulanIni < 0) {
    financialInsights.push({
      type: "negative",
      title: "Cash flow negatif",
      description: `Pengeluaran bulan ini lebih besar daripada pemasukan sebesar ${formatRupiah(
        Math.abs(cashFlowBulanIni)
      )}.`,
    })
  }

  if (expenseChange !== null) {
    if (expenseChange < 0) {
      financialInsights.push({
        type: "positive",
        title: "Pengeluaran menurun",
        description: `Total pengeluaran turun ${Math.abs(
          expenseChange
        ).toFixed(1)}% dibanding bulan lalu.`,
      })
    } else if (expenseChange > 0) {
      financialInsights.push({
        type: "warning",
        title: "Pengeluaran meningkat",
        description: `Total pengeluaran naik ${expenseChange.toFixed(
          1
        )}% dibanding bulan lalu.`,
      })
    }
  }

  if (topIncreasedCategory) {
    financialInsights.push({
      type: "warning",
      title: "Kenaikan terbesar",
      description: `${topIncreasedCategory.categoryName} mengalami kenaikan pengeluaran sebesar ${formatRupiah(
        topIncreasedCategory.changeAmount
      )} dibanding bulan lalu.`,
    })
  }

  if (topDecreasedCategory) {
    financialInsights.push({
      type: "positive",
      title: "Pengeluaran berhasil ditekan",
      description: `${topDecreasedCategory.categoryName} turun sebesar ${formatRupiah(
        Math.abs(topDecreasedCategory.changeAmount)
      )} dibanding bulan lalu.`,
    })
  }

  // ============================================================
  // CASH FLOW 6 BULAN
  // ============================================================

  const cashFlowChartData: {
    month: string
    income: number
    expense: number
  }[] = []

  for (let i = 5; i >= 0; i--) {
    const chartMonth =
      getPreviousMonth(
        monthRange.year,
        monthRange.month,
        i
      )

    const {
      data: chartTransactions,
    } = await supabase
      .from('transactions')
      .select(`
        type,
        amount
      `)
      .eq('family_id', familyId)
      .gte(
        'transaction_date',
        chartMonth.startDate
      )
      .lt(
        'transaction_date',
        chartMonth.endDate
      )

    const income =
      chartTransactions
        ?.filter(
          (transaction) =>
            transaction.type === 'income'
        )
        .reduce(
          (total, transaction) =>
            total +
            Number(transaction.amount),
          0
        ) ?? 0

    const expense =
      chartTransactions
        ?.filter(
          (transaction) =>
            transaction.type === 'expense'
        )
        .reduce(
          (total, transaction) =>
            total +
            Number(transaction.amount),
          0
        ) ?? 0

    const monthName =
      new Intl.DateTimeFormat(
        'id-ID',
        {
          month: 'short',
        }
      ).format(chartMonth.date)

    cashFlowChartData.push({
      month: monthName,
      income,
      expense,
    })
  }

  // ============================================================
  // BALANCE PERCENTAGE
  // ============================================================

  const getBalancePercentage = (
    balance: number
  ) => {
    if (totalSaldo <= 0) {
      return 0
    }

    return (
      (balance / totalSaldo) * 100
    )
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <header className="mb-8">
          <p className="text-sm text-gray-500">
            Family Finance
          </p>

          <div className="mt-1 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-700">
                Dashboard
              </h1>

              <p className="mt-2 text-gray-600">
                Halo, {user.email}
              </p>
            </div>

            <div className="rounded-xl bg-white px-5 py-3 shadow-sm">
              <p className="text-xs text-gray-500">
                Keluarga
              </p>

              <p className="font-semibold text-gray-700">
                {family?.name ?? '-'}
              </p>
            </div>
          </div>
        </header>

        {/* ================================================== */}
        {/* TOTAL SALDO */}
        {/* ================================================== */}

        <section className="rounded-2xl bg-black p-6 text-white shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">

            {/* TOTAL SALDO */}
            <div>
              <p className="text-sm text-gray-400">
                Total Saldo
              </p>

              <p className="mt-2 text-4xl font-bold">
                {formatRupiah(totalSaldo)}
              </p>

              <p className="mt-2 text-sm text-gray-400">
                {accounts.length} rekening aktif
              </p>
            </div>

            {/* AVAILABLE + GOAL */}
            <div className="grid grid-cols-2 gap-3 md:min-w-[360px]">

              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs text-gray-400">
                  Saldo Tersedia
                </p>

                <p className="mt-1 text-lg font-bold text-white">
                  {formatRupiah(totalSaldoTersedia)}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Siap digunakan
                </p>
              </div>

              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs text-gray-400">
                  Dana Goal
                </p>

                <p className="mt-1 text-lg font-bold text-white">
                  {formatRupiah(totalDanaGoal)}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Dana dicadangkan
                </p>
              </div>

            </div>

          </div>
        </section>

        {/* ================================================== */}
        {/* FILTER PERIODE */}
        {/* ================================================== */}

        <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Periode Dashboard
            </p>

            <p className="text-xs text-gray-500">
              Pilih bulan yang ingin ditampilkan
            </p>
          </div>

          <form
            method="GET"
            className="flex items-center gap-2"
          >
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="rounded-lg border px-3 py-2 text-sm text-black"
            />

            <button
              type="submit"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Terapkan
            </button>
          </form>
        </section>

        {/* RINGKASAN KEUANGAN */}
        <section className="mt-6">

          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-700">
              Ringkasan {selectedMonthLabel}
            </h2>

            <p className="text-sm text-gray-500">
              Kondisi keuangan keluarga pada periode yang dipilih.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

            {/* PEMASUKAN */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Pemasukan
              </p>

              <p className="mt-2 text-2xl font-bold text-green-600">
                {formatRupiah(pemasukanBulanIni)}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                {incomeChange === null
                  ? 'Belum ada data bulan lalu'
                  : `${incomeChange >= 0 ? '+' : ''}${incomeChange.toFixed(1)}% dari bulan lalu`}
              </p>
            </div>

            {/* PENGELUARAN */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Pengeluaran
              </p>

              <p className="mt-2 text-2xl font-bold text-red-600">
                {formatRupiah(totalPengeluaranBulanIni)}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                {expenseChange === null
                  ? 'Belum ada data bulan lalu'
                  : `${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}% dari bulan lalu`}
              </p>
            </div>

            {/* CASH FLOW */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Net Cash Flow
              </p>

              <p
                className={`mt-2 text-2xl font-bold ${
                  cashFlowBulanIni >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {cashFlowBulanIni >= 0 ? '+' : ''}
                {formatRupiah(cashFlowBulanIni)}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                {cashFlowChange === null
                  ? 'Belum ada data bulan lalu'
                  : `${cashFlowChange >= 0 ? '+' : ''}${cashFlowChange.toFixed(1)}% dari bulan lalu`}
              </p>
            </div>

            {/* SAVINGS RATE */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Savings Rate
              </p>

              <p
                className={`mt-2 text-2xl font-bold ${
                  savingsRate >= 20
                    ? 'text-green-600'
                    : savingsRate >= 10
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {savingsRate.toFixed(1)}%
              </p>

              <p className="mt-2 text-xs text-gray-500">
                Persentase pemasukan yang berhasil disimpan
              </p>
            </div>

          </div>

        </section>

        {/* ================================================== */}
        {/* BUDGET */}
        {/* ================================================== */}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">

            <div>
              <p className="text-sm text-gray-500">
                Budget {selectedMonthLabel}
              </p>

              <h2 className="mt-1 text-2xl font-bold text-gray-700">
                {formatRupiah(totalBudget)}
              </h2>
            </div>

            <Link
              href="/budgets"
              className="text-sm font-medium text-gray-600 hover:text-black"
            >
              Kelola Budget →
            </Link>

          </div>

          {totalBudget > 0 ? (
            <>

              <div className="mt-5 flex items-center justify-between text-sm">

                <span className="text-gray-500">
                  Terpakai{' '}
                  {formatRupiah(
                    pengeluaranBudgetBulanIni
                  )}
                </span>

                <span
                  className={`font-semibold ${
                    budgetPercentage > 100
                      ? 'text-red-600'
                      : budgetPercentage >= 90
                        ? 'text-yellow-600'
                        : 'text-green-600'
                  }`}
                >
                  {budgetPercentage.toFixed(1)}%
                </span>

              </div>

              <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">

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

              <div className="mt-3 flex items-center justify-between">

                <p className="text-sm text-gray-500">
                  {budgetPercentage > 100
                    ? 'Budget terlampaui'
                    : 'Sisa budget'}
                </p>

                <p
                  className={`text-sm font-semibold ${
                    totalBudgetRemaining < 0
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}
                >
                  {totalBudgetRemaining < 0
                    ? '-'
                    : ''}
                  {formatRupiah(
                    Math.abs(
                      totalBudgetRemaining
                    )
                  )}
                </p>

              </div>

            </>
          ) : (
            <div className="mt-5 rounded-xl bg-gray-50 p-4">

              <p className="text-sm text-gray-500">
                Belum ada budget untuk bulanan.
              </p>

              <Link
                href="/budgets/new"
                className="mt-2 inline-block text-sm font-medium underline"
              >
                Tambah budget
              </Link>

            </div>
          )}

        </section>

        {/* ================================================== */}
        {/* BUDGET VS ACTUAL */}
        {/* ================================================== */}

        <section className="mt-8">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-xl font-bold text-gray-700">
                Budget vs Actual
              </h2>

              <p className="text-sm text-gray-500">
                Perbandingan budget dan pengeluaran pada {selectedMonthLabel}.
              </p>
            </div>

            <Link
              href="/budgets"
              className="text-sm font-medium text-gray-600 hover:text-black"
            >
              Lihat detail →
            </Link>

          </div>

          {budgetVsActual.length === 0 ? (

            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">

              <p className="font-medium text-gray-700">
                Belum ada budget
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Buat budget untuk melihat perbandingan budget dan aktual.
              </p>

              <Link
                href="/budgets/new"
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                + Buat Budget
              </Link>

            </div>

          ) : (

            <div className="space-y-4">

              {budgetVsActual.map((item) => (

                <div
                  key={item.id}
                  className="rounded-2xl bg-white p-5 shadow-sm"
                >

                  <div className="flex items-start justify-between gap-4">

                    <div>
                      <p className="font-semibold text-gray-700">
                        {item.categoryName}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        Aktual {formatRupiah(item.actual)}
                        {' '}dari{' '}
                        {formatRupiah(item.budget)}
                      </p>
                    </div>

                    <div className="text-right">

                      <p
                        className={`text-sm font-semibold ${
                          item.percentage > 100
                            ? 'text-red-600'
                            : item.percentage >= 90
                              ? 'text-yellow-600'
                              : 'text-green-600'
                        }`}
                      >
                        {item.percentage.toFixed(1)}%
                      </p>

                      <p
                        className={`text-xs ${
                          item.remaining < 0
                            ? 'text-red-500'
                            : 'text-gray-400'
                        }`}
                      >
                        {item.remaining < 0
                          ? `Over ${formatRupiah(Math.abs(item.remaining))}`
                          : `Sisa ${formatRupiah(item.remaining)}`}
                      </p>

                    </div>

                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">

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

                </div>

              ))}

            </div>

          )}

        </section>

        {/* ================================================== */}
        {/* CASH FLOW 6 BULAN */}
        {/* ================================================== */}

        <section className="mt-8">

          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-700">
              Cash Flow 6 Bulan
            </h2>

            <p className="text-sm text-gray-500">
              Perbandingan pemasukan dan pengeluaran
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">

            <div className="mb-6 grid gap-4 md:grid-cols-3">

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">
                  Pemasukan {selectedMonthLabel}
                </p>

                <p className="mt-1 text-lg font-bold text-green-600">
                  {formatRupiah(
                    pemasukanBulanIni
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">
                  Pengeluaran {selectedMonthLabel}
                </p>

                <p className="mt-1 text-lg font-bold text-red-600">
                  {formatRupiah(
                    totalPengeluaranBulanIni
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs text-gray-500">
                  Cash Flow
                </p>

                <p
                  className={`mt-1 text-lg font-bold ${
                    cashFlowBulanIni >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {cashFlowBulanIni >= 0
                    ? '+'
                    : ''}
                  {formatRupiah(
                    cashFlowBulanIni
                  )}
                </p>
              </div>

            </div>

            <CashFlowChart
              data={cashFlowChartData}
            />

          </div>

        </section>

        {/* ================================================== */}
        {/* FINANCIAL GOALS */}
        {/* ================================================== */}

        <section className="mt-8">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-xl font-bold text-gray-700">
                Financial Goals
              </h2>

              <p className="text-sm text-gray-500">
                Progress target keuangan keluarga
              </p>
            </div>

            <Link
              href="/goals"
              className="text-sm font-medium text-gray-600 hover:text-black"
            >
              Lihat semua →
            </Link>

          </div>

          {(financialGoals ?? []).length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">

              <p className="font-medium text-gray-700">
                Belum ada financial goal
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Buat target keuangan agar progress dapat dipantau.
              </p>

              <Link
                href="/goals/new"
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                + Buat Goal
              </Link>

            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">

              {(financialGoals ?? []).map(
                (goal) => {

                  const target =
                    Number(
                      goal.target_amount
                    )

                  const current =
                    Number(
                      goal.current_amount
                    )

                  const percentage =
                    target > 0
                      ? Math.min(
                          (current /
                            target) *
                            100,
                          100
                        )
                      : 0

                  return (
                    <Link
                      key={goal.id}
                      href={`/goals/${goal.id}/edit`}
                      className="rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
                    >

                      <h3 className="font-semibold text-gray-700">
                        {goal.name}
                      </h3>

                      <div className="mt-4 flex items-end justify-between gap-3">

                        <p className="text-lg font-bold text-gray-700">
                          {formatRupiah(
                            current
                          )}
                        </p>

                        <p className="text-xs text-gray-500">
                          {percentage.toFixed(
                            0
                          )}
                          %
                        </p>

                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">

                        <div
                          className="h-full rounded-full bg-black"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />

                      </div>

                      <p className="mt-2 text-xs text-gray-400">
                        Target{' '}
                        {formatRupiah(
                          target
                        )}
                      </p>

                      {goal.deadline && (
                        <p className="mt-1 text-xs text-gray-400">
                          Deadline:{' '}
                          {new Intl.DateTimeFormat(
                            'id-ID',
                            {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            }
                          ).format(
                            new Date(
                              `${goal.deadline}T00:00:00`
                            )
                          )}
                        </p>
                      )}

                    </Link>
                  )
                }
              )}

            </div>
          )}

        </section>

        {/* ================================================== */}
        {/* SPENDING ANALYSIS */}
        {/* ================================================== */}

        <section className="mt-8">

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">

            <div>
              <h2 className="text-xl font-bold text-gray-700">
                Spending Analysis
              </h2>

              <p className="text-sm text-gray-500">
                Distribusi pengeluaran berdasarkan kategori pada {selectedMonthLabel}.
              </p>
            </div>

            <Link
              href="/reports"
              className="text-sm font-medium text-gray-600 hover:text-black"
            >
              Lihat laporan →
            </Link>

          </div>

          {spendingAnalysis.length === 0 ? (

            <div className="rounded-2xl bg-white p-6 text-center shadow-sm">

              <p className="font-medium text-gray-700">
                Belum ada pengeluaran
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Data pengeluaran akan muncul di sini.
              </p>

            </div>

          ) : (

            <div className="space-y-4">

              {topSpendingCategory && (
                <div className="rounded-2xl bg-gray-900 p-6 text-white shadow-sm">

                  <p className="text-sm text-gray-400">
                    Pengeluaran terbesar
                  </p>

                  <p className="mt-1 text-xl font-semibold">
                    {topSpendingCategory.categoryName}
                  </p>

                  <p className="mt-2 text-2xl font-bold">
                    {formatRupiah(
                      topSpendingCategory.amount
                    )}
                  </p>

                  <p className="mt-1 text-sm text-gray-400">
                    {topSpendingCategory.contribution.toFixed(1)}%
                    {' '}dari total pengeluaran
                  </p>

                </div>
              )}

              <div className="rounded-2xl bg-white p-6 shadow-sm">

                <div className="space-y-5">

                  {spendingAnalysis
                    .slice(0, 5)
                    .map((item) => (

                      <div
                        key={item.categoryName}
                      >

                        <div className="mb-2 flex items-center justify-between gap-4">

                          <div>
                            <p className="font-medium text-gray-700">
                              {item.categoryName}
                            </p>

                            <p className="text-xs text-gray-500">
                              {item.contribution.toFixed(1)}%
                              {' '}dari total
                            </p>
                          </div>

                          <div className="text-right">

                            <p className="font-semibold text-gray-700">
                              {formatRupiah(
                                item.amount
                              )}
                            </p>

                            <p
                              className={`text-xs ${
                                item.change === null
                                  ? 'text-gray-400'
                                  : item.change > 0
                                    ? 'text-red-500'
                                    : item.change < 0
                                      ? 'text-green-600'
                                      : 'text-gray-400'
                              }`}
                            >
                              {item.change === null
                                ? 'Belum ada data bulan lalu'
                                : item.change > 0
                                  ? `↑ ${item.change.toFixed(1)}% vs bulan lalu`
                                  : item.change < 0
                                    ? `↓ ${Math.abs(item.change).toFixed(1)}% vs bulan lalu`
                                    : '→ Sama dengan bulan lalu'}
                            </p>

                          </div>

                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">

                          <div
                            className="h-full rounded-full bg-black"
                            style={{
                              width: `${Math.min(
                                item.contribution,
                                100
                              )}%`,
                            }}
                          />

                        </div>

                      </div>

                    ))}

                </div>

              </div>

            </div>

          )}

        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Perubahan Pengeluaran</h2>
            <p className="text-sm text-muted-foreground">
              Perbandingan dengan bulan sebelumnya
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Total perubahan */}
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                Total Pengeluaran
              </p>

              <p className="mt-2 text-xl font-semibold">
                {expenseChange === null
                  ? "—"
                  : `${expenseChange >= 0 ? "+" : ""}${expenseChange.toFixed(1)}%`}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                dibanding bulan lalu
              </p>
            </div>

            {/* Kenaikan terbesar */}
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                Kenaikan Terbesar
              </p>

              {topIncreasedCategory ? (
                <>
                  <p className="mt-2 font-semibold">
                    {topIncreasedCategory.categoryName}
                  </p>

                  <p className="mt-1 text-sm">
                    +{formatRupiah(topIncreasedCategory.changeAmount)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {topIncreasedCategory.changePercentage !== null
                      ? `+${topIncreasedCategory.changePercentage.toFixed(1)}%`
                      : "Bulan lalu Rp0"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Tidak ada kenaikan
                </p>
              )}
            </div>

            {/* Penurunan terbesar */}
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                Penurunan Terbesar
              </p>

              {topDecreasedCategory ? (
                <>
                  <p className="mt-2 font-semibold">
                    {topDecreasedCategory.categoryName}
                  </p>

                  <p className="mt-1 text-sm">
                    {formatRupiah(topDecreasedCategory.changeAmount)}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {topDecreasedCategory.changePercentage !== null
                      ? `${topDecreasedCategory.changePercentage.toFixed(1)}%`
                      : "—"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Tidak ada penurunan
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ================================================== */}
        {/* TOP 5 PENGELUARAN */}
        {/* ================================================== */}

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="text-xl font-semibold text-gray-700">
              Pengeluaran Terbesar
            </h2>

            <p className="text-sm text-gray-500">
              5 kategori dengan pengeluaran terbesar pada {selectedMonthLabel}.
            </p>
          </div>

          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-gray-500">
              Belum ada pengeluaran bulan ini.
            </p>
          ) : (
            <div className="space-y-4">

              {expenseByCategory
                .slice(0, 5)
                .map(
                  (
                    [
                      categoryName,
                      total,
                    ],
                    index
                  ) => (
                    <div
                      key={categoryName}
                      className="flex items-center justify-between gap-4"
                    >

                      <div className="flex min-w-0 items-center gap-3">

                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                          {index + 1}
                        </div>

                        <p className="truncate font-medium text-gray-700">
                          {categoryName}
                        </p>

                      </div>

                      <p className="shrink-0 font-semibold text-gray-700">
                        {formatRupiah(
                          Number(total)
                        )}
                      </p>

                    </div>
                  )
                )}

            </div>
          )}

        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Financial Insights</h2>
            <p className="text-sm text-muted-foreground">
              Ringkasan otomatis kondisi keuangan bulan ini
            </p>
          </div>

          {financialInsights.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Belum ada insight yang cukup untuk ditampilkan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {financialInsights.map((insight, index) => (
                <div
                  key={`${insight.title}-${index}`}
                  className="rounded-xl border p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">
                      {insight.type === "positive"
                        ? "🟢"
                        : insight.type === "warning"
                          ? "🟠"
                          : "🔴"}
                    </div>

                    <div>
                      <p className="font-medium">
                        {insight.title}
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {insight.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================================================== */}
        {/* INSIGHT BUDGET */}
        {/* ================================================== */}

        <section className="mt-8 rounded-2xl bg-gray-900 p-6 text-white">

          <p className="text-sm text-gray-400">
            Insight Keuangan
          </p>

          <h2 className="mt-1 text-xl font-semibold">

            {totalBudget <= 0
              ? 'Belum ada budget bulanan'
              : budgetPercentage > 100
                ? 'Pengeluaran sudah melewati budget'
                : budgetPercentage >= 90
                  ? 'Budget hampir habis'
                  : budgetPercentage >= 75
                    ? 'Penggunaan budget mulai tinggi'
                    : 'Pengelolaan budget masih aman'}

          </h2>

          {totalBudget > 0 && (
            <div className="mt-5">

              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">

                <span>
                  Budget terpakai
                </span>

                <span>
                  {budgetPercentage.toFixed(
                    1
                  )}
                  %
                </span>

              </div>

              <div className="h-2 overflow-hidden rounded-full bg-gray-700">

                <div
                  className={`h-full rounded-full ${
                    budgetPercentage > 100
                      ? 'bg-red-500'
                      : budgetPercentage >= 90
                        ? 'bg-yellow-400'
                        : 'bg-white'
                  }`}
                  style={{
                    width: `${Math.min(
                      budgetPercentage,
                      100
                    )}%`,
                  }}
                />

              </div>

            </div>
          )}

          <p className="mt-3 text-sm leading-6 text-gray-300">

            {totalBudget <= 0
              ? 'Tambahkan budget agar dashboard dapat membantu memantau batas pengeluaran bulanan.'
              : budgetPercentage > 100
                ? `Pengeluaran sudah melebihi budget sebesar ${formatRupiah(
                    Math.abs(
                      totalBudgetRemaining
                    )
                  )}.`
                : `Kamu sudah menggunakan ${budgetPercentage.toFixed(
                    1
                  )}% dari total budget bulanan. Sisa budget ${formatRupiah(
                    totalBudgetRemaining
                  )}.`}

          </p>

        </section>

        {/* ================================================== */}
        {/* REKENING */}
        {/* ================================================== */}

        <section className="mt-8">

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-xl font-bold text-gray-700">
                Rekening
              </h2>

              <p className="text-sm text-gray-500">
                Semua rekening keluarga
              </p>
            </div>

            <div className="flex flex-wrap gap-2">

              <Link
                href="/transactions/new"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Transaksi
              </Link>

              <Link
                href="/accounts/new"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Rekening
              </Link>

              <Link
                href="/reports"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Laporan
              </Link>

              <Link
                href="/transactions"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Riwayat
              </Link>

            </div>

          </div>

          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">

              <p className="font-medium text-gray-700">
                Belum ada rekening
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Tambahkan rekening untuk mulai mencatat keuangan.
              </p>

              <Link
                href="/accounts/new"
                className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
              >
                + Tambah Rekening
              </Link>

            </div>
          ) : (
            <>

              {/* RINGKASAN SALDO */}

              <div className="mb-6 grid gap-4 md:grid-cols-3">

                {/* TOTAL */}
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Total Saldo Keluarga
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-700">
                    {formatRupiah(totalSaldo)}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Gabungan seluruh rekening aktif
                  </p>
                </div>

                {/* AVAILABLE */}
                <div className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Saldo Tersedia
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-700">
                    {formatRupiah(totalSaldoTersedia)}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Dapat digunakan untuk transaksi
                  </p>
                </div>

                {/* GOAL */}
                <div className="rounded-2xl bg-amber-50 p-6 shadow-sm">
                  <p className="text-sm text-amber-700">
                    Dana Goal
                  </p>

                  <p className="mt-2 text-2xl font-bold text-amber-900">
                    {formatRupiah(totalDanaGoal)}
                  </p>

                  <p className="mt-1 text-xs text-amber-700">
                    Dana yang sudah dicadangkan
                  </p>
                </div>

              </div>

              {/* DAFTAR REKENING */}

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                {accounts.map(
                  (account) => {

                    const actualBalance =
                      Number(account.balance ?? 0)

                    const allocatedAmount =
                      allocatedByAccount[account.account_id] ?? 0

                    const availableBalance =
                      actualBalance - allocatedAmount

                    return (

                    <div
                      key={
                        account.account_id
                      }
                      className="rounded-2xl bg-white p-5 shadow-sm"
                    >

                      <div className="flex items-start justify-between">

                        <div>

                          <p className="text-sm text-gray-500">
                            {account.account_type}
                          </p>

                          <h3 className="mt-1 text-lg font-semibold text-gray-700">
                            {account.account_name}
                          </h3>

                        </div>

                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                          Aktif
                        </span>

                      </div>

                      {/* SALDO AKTUAL */}

                      <div className="mt-5">
                        <p className="text-xs text-gray-500">
                          Saldo aktual
                        </p>

                        <div className="mt-1 flex items-end justify-between gap-3">

                          <p className="text-2xl font-bold text-gray-700">
                            {formatRupiah(actualBalance)}
                          </p>

                          <span className="text-sm text-gray-500">
                            {getBalancePercentage(actualBalance).toFixed(1)}%
                          </span>

                        </div>
                      </div>

                      {/* SALDO TERSEDIA */}

                      <div className="mt-4 rounded-xl bg-gray-50 p-4">
                        <p className="text-xs font-medium text-gray-500">
                          Saldo tersedia
                        </p>

                        <p
                          className={`mt-1 text-lg font-bold ${
                            availableBalance < 0
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }`}
                        >
                          {formatRupiah(availableBalance)}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Dapat digunakan
                        </p>
                      </div>

                      {/* DANA GOAL */}

                      <div className="mt-3 rounded-xl bg-amber-50 p-4">
                        <div className="flex items-center justify-between">

                          <div>
                            <p className="text-xs font-medium text-amber-700">
                              Dana Goal
                            </p>

                            <p className="mt-1 text-lg font-bold text-amber-900">
                              {formatRupiah(allocatedAmount)}
                            </p>
                          </div>

                          <span className="text-lg">
                            🎯
                          </span>

                        </div>

                        {allocatedAmount > 0 && (
                          <p className="mt-1 text-xs text-amber-700">
                            Dicadangkan untuk goal
                          </p>
                        )}
                      </div>

                      <p className="mt-3 text-xs text-gray-400">
                        Saldo awal:{' '}
                        {formatRupiah(
                          Number(account.initial_balance ?? 0)
                        )}
                      </p>

                    </div>
                    )
                  }
                )}

              </div>

            </>
          )}

        </section>

      </div>
    </main>
  )
}
