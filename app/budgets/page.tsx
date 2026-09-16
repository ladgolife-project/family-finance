import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

type Budget = {
  id: string
  category_id: string
  amount: number
  month: string | null
  is_active: boolean
}

type Category = {
  id: string
  name: string
}

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

function getCurrentMonth() {
  const now = new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`
}

function getNextMonth(monthValue: string) {
  const [year, month] =
    monthValue.split('-').map(Number)

  const date = new Date(
    year,
    month,
    1
  )

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}-01`
}

export default async function BudgetsPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient()

  // ============================================================
  // USER
  // ============================================================

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // ============================================================
  // FAMILY
  // ============================================================

  const { data: membership } =
    await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

  if (!membership?.family_id) {
    redirect('/')
  }

  const familyId = membership.family_id

  // ============================================================
  // FILTER BULAN
  // ============================================================

  const params = await searchParams

  const selectedMonth =
    params.month ?? getCurrentMonth()

  const monthStart =
    `${selectedMonth}-01`

  const nextMonth =
    getNextMonth(selectedMonth)

  const monthLabel =
    new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
    }).format(
      new Date(
        `${monthStart}T00:00:00`
      )
    )

  // ============================================================
  // AMBIL BUDGET RECURRING
  // ============================================================

  const {
    data: budgets,
    error: budgetError,
  } = await supabase
    .from('budgets')
    .select(`
      id,
      category_id,
      amount,
      month,
      is_active
    `)
    .eq('family_id', familyId)
    .is('month', null)
    .eq('is_active', true)
    .order('amount', {
      ascending: false,
    })

  if (budgetError) {
    throw new Error(
      budgetError.message
    )
  }

  // ============================================================
  // AMBIL KATEGORI
  // ============================================================

  const categoryIds =
    (budgets ?? []).map(
      (budget) => budget.category_id
    )

  let categories: Category[] = []

  if (categoryIds.length > 0) {
    const {
      data: categoryData,
      error: categoryError,
    } = await supabase
      .from('categories')
      .select('id, name')
      .eq('family_id', familyId)
      .in('id', categoryIds)

    if (categoryError) {
      throw new Error(
        categoryError.message
      )
    }

    categories = categoryData ?? []
  }

  // ============================================================
  // AMBIL TRANSAKSI BULAN TERPILIH
  // ============================================================

  const {
    data: transactions,
    error: transactionError,
  } = await supabase
    .from('transactions')
    .select(
      'category_id, amount'
    )
    .eq('family_id', familyId)
    .eq('type', 'expense')
    .gte(
      'transaction_date',
      monthStart
    )
    .lt(
      'transaction_date',
      nextMonth
    )

  if (transactionError) {
    throw new Error(
      transactionError.message
    )
  }

  // ============================================================
  // ACTUAL PER KATEGORI
  // ============================================================

  const actualByCategory =
    (transactions ?? []).reduce<
      Record<string, number>
    >(
      (
        result,
        transaction
      ) => {
        const categoryId =
          transaction.category_id

        result[categoryId] =
          (
            result[categoryId] ?? 0
          ) +
          Number(
            transaction.amount ?? 0
          )

        return result
      },
      {}
    )

  // ============================================================
  // TOTAL BUDGET
  // ============================================================

  const totalBudget =
    (budgets ?? []).reduce(
      (total, budget) =>
        total +
        Number(
          budget.amount ?? 0
        ),
      0
    )

  // ============================================================
  // TOTAL ACTUAL YANG MEMILIKI BUDGET
  // ============================================================

  const totalActual =
    (budgets ?? []).reduce(
      (total, budget) =>
        total +
        (
          actualByCategory[
            budget.category_id
          ] ?? 0
        ),
      0
    )

  // ============================================================
  // TOTAL SEMUA PENGELUARAN
  // ============================================================

  const totalExpenseAllCategories =
    (transactions ?? []).reduce(
      (total, transaction) =>
        total +
        Number(
          transaction.amount ?? 0
        ),
      0
    )

  // ============================================================
  // PENGELUARAN DI LUAR BUDGET
  // ============================================================

  const expenseOutsideBudget =
    Math.max(
      0,
      totalExpenseAllCategories -
        totalActual
    )

  // ============================================================
  // SISA BUDGET
  // ============================================================

  const totalRemaining =
    totalBudget - totalActual

  // ============================================================
  // PERSENTASE
  // ============================================================

  const totalBudgetPercentage =
    totalBudget > 0
      ? (totalActual /
          totalBudget) *
        100
      : 0

  // ============================================================
  // STATUS
  // ============================================================

  const overallBudgetStatus =
    totalBudget <= 0
      ? 'Belum ada budget'
      : totalBudgetPercentage > 100
        ? 'Melewati budget'
        : totalBudgetPercentage >= 90
          ? 'Hampir habis'
          : totalBudgetPercentage >= 75
            ? 'Mulai tinggi'
            : 'Aman'

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">

          <div>
            <p className="text-sm text-gray-500">
              Family Finance
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-700">
              Budget
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Budget otomatis berlaku setiap bulan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

            {/* FILTER BULAN */}

            <form
              method="GET"
              className="flex items-center gap-2"
            >
              <label
                htmlFor="month"
                className="text-sm font-medium text-gray-500"
              >
                Bulan
              </label>

              <input
                id="month"
                type="month"
                name="month"
                defaultValue={selectedMonth}
                className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-500"
              />

              <button
                type="submit"
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                Tampilkan
              </button>
            </form>

            {/* TAMBAH BUDGET */}

            <Link
              href="/budgets/new"
              className="rounded-lg bg-black px-5 py-3 text-center font-medium text-white hover:bg-gray-800"
            >
              + Tambah Budget
            </Link>

          </div>

        </div>

        {/* ================================================== */}
        {/* BULAN AKTIF */}
        {/* ================================================== */}

        <div className="mb-6">
          <p className="text-sm text-gray-500">
            Monitoring budget untuk
          </p>

          <h2 className="text-xl font-semibold text-gray-700">
            {monthLabel}
          </h2>

          <p className="mt-1 text-xs text-gray-400">
            Budget yang ditampilkan berlaku otomatis setiap bulan.
          </p>
        </div>

        {/* ================================================== */}
        {/* RINGKASAN */}
        {/* ================================================== */}

        <section className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Budget
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-600">
              {formatRupiah(
                totalBudget
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm text-gray-600">
            <p className="text-sm text-gray-500">
              Sudah Terpakai
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatRupiah(
                totalActual
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Sisa Budget
            </p>

            <p
              className={`mt-2 text-2xl font-bold ${
                totalRemaining < 0
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {formatRupiah(
                totalRemaining
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Di Luar Budget
            </p>

            <p className="mt-2 text-xl font-bold text-gray-700">
              {formatRupiah(
                expenseOutsideBudget
              )}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Pengeluaran kategori tanpa budget.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Status Budget
            </p>

            <p className="mt-2 text-xl font-bold text-gray-700">
              {overallBudgetStatus}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {totalBudget > 0
                ? `${totalBudgetPercentage.toFixed(1)}% budget telah digunakan.`
                : 'Belum ada budget aktif.'}
            </p>
          </div>

        </section>

        {/* ================================================== */}
        {/* DAFTAR BUDGET */}
        {/* ================================================== */}

        {(budgets ?? []).length === 0 ? (

          <section className="rounded-2xl bg-white p-10 text-center shadow-sm">

            <h2 className="text-lg font-semibold">
              Belum ada budget
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Buat budget sekali dan budget tersebut akan
              otomatis berlaku setiap bulan.
            </p>

            <Link
              href="/budgets/new"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 text-sm font-medium text-white"
            >
              + Tambah Budget
            </Link>

          </section>

        ) : (

          <section className="space-y-4">

            {(budgets ?? []).map(
              (budget) => {

                const budgetAmount =
                  Number(
                    budget.amount ?? 0
                  )

                const actual =
                  actualByCategory[
                    budget.category_id
                  ] ?? 0

                const percentage =
                  budgetAmount > 0
                    ? (
                        actual /
                        budgetAmount
                      ) *
                      100
                    : 0

                const remaining =
                  budgetAmount -
                  actual

                const budgetStatus =
                  percentage > 100
                    ? 'Melewati budget'
                    : percentage >= 90
                      ? 'Hampir habis'
                      : percentage >= 75
                        ? 'Mulai tinggi'
                        : 'Aman'

                const category =
                  categories.find(
                    (item) =>
                      item.id ===
                      budget.category_id
                  )

                return (
                  <div
                    key={budget.id}
                    className="rounded-2xl bg-white p-5 shadow-sm"
                  >

                    {/* HEADER BUDGET */}

                    <div className="flex items-start justify-between gap-4">

                      <div>
                        <h2 className="font-semibold text-gray-700">
                          {category?.name ??
                            'Tanpa kategori'}
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                          Terpakai{' '}
                          {formatRupiah(
                            actual
                          )}{' '}
                          dari{' '}
                          {formatRupiah(
                            budgetAmount
                          )}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Berlaku setiap bulan
                        </p>
                      </div>

                      <div className="flex items-start gap-3">

                        {/* EDIT */}

                        <Link
                          href={`/budgets/${budget.id}/edit`}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </Link>

                        {/* STATUS */}

                        <div className="text-right">

                          <p
                            className={`text-sm font-semibold ${
                              percentage > 100
                                ? 'text-red-600'
                                : percentage >= 90
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {percentage.toFixed(
                              1
                            )}
                            %
                          </p>

                          <p
                            className={`text-xs ${
                              remaining < 0
                                ? 'text-red-500'
                                : 'text-gray-400'
                            }`}
                          >
                            {remaining < 0
                              ? 'Melebihi budget '
                              : 'Sisa '}

                            {formatRupiah(
                              Math.abs(
                                remaining
                              )
                            )}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            Status:{' '}
                            {budgetStatus}
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* PROGRESS BAR */}

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">

                      <div
                        className={`h-full rounded-full ${
                          percentage > 100
                            ? 'bg-red-500'
                            : percentage >= 90
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            percentage,
                            100
                          )}%`,
                        }}
                      />

                    </div>

                  </div>
                )
              }
            )}

          </section>

        )}

      </div>
    </main>
  )
}