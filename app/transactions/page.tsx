import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-')

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    )
  )
}

type Transaction = {
  id: string
  account_id: string
  category_id: string
  type: 'income' | 'expense'
  amount: number
  transaction_date: string
  description: string | null
}

export default async function TransactionsPage() {
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

  if (!membership?.family_id) {
    redirect('/')
  }

  const familyId = membership.family_id

  // =========================
  // AMBIL TRANSAKSI
  // =========================

  const {
    data: transactionData,
    error: transactionError,
  } = await supabase
    .from('transactions')
    .select(`
      id,
      account_id,
      category_id,
      type,
      amount,
      transaction_date,
      description
    `)
    .eq('family_id', familyId)
    .order('transaction_date', {
      ascending: false,
    })
    .order('created_at', {
      ascending: false,
    })

  if (transactionError) {
    throw new Error(transactionError.message)
  }

  const transactions =
    (transactionData ?? []) as Transaction[]

  // =========================
  // AMBIL REKENING
  // =========================

  const { data: accounts, error: accountError } =
    await supabase
      .from('accounts')
      .select('id, name')
      .eq('family_id', familyId)

  if (accountError) {
    throw new Error(accountError.message)
  }

  // =========================
  // AMBIL KATEGORI
  // =========================

  const { data: categories, error: categoryError } =
    await supabase
      .from('categories')
      .select('id, name')
      .eq('family_id', familyId)

  if (categoryError) {
    throw new Error(categoryError.message)
  }

  const accountMap = new Map(
    (accounts ?? []).map((account) => [
      account.id,
      account.name,
    ])
  )

  const categoryMap = new Map(
    (categories ?? []).map((category) => [
      category.id,
      category.name,
    ])
  )

  // =========================
  // SUMMARY
  // =========================

  const totalIncome = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce(
      (total, transaction) =>
        total + Number(transaction.amount),
      0
    )

  const totalExpense = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce(
      (total, transaction) =>
        total + Number(transaction.amount),
      0
    )

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-500">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-black"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-4 text-3xl font-bold text-gray-700">
              Riwayat Transaksi
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Semua pemasukan dan pengeluaran keluarga.
            </p>
          </div>

          <Link
            href="/transactions/new"
            className="inline-flex w-fit rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-gray-800"
          >
            + Tambah Transaksi
          </Link>
        </div>

        {/* SUMMARY */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-700">
              {transactions.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Pemasukan
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-700">
              {formatRupiah(totalIncome)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Pengeluaran
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-700">
              {formatRupiah(totalExpense)}
            </p>
          </div>

        </div>

        {/* TRANSACTIONS */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">

          {transactions.length === 0 ? (
            <div className="p-12 text-center">

              <h2 className="text-lg font-semibold text-gray-700">
                Belum ada transaksi
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Tambahkan transaksi pertama untuk mulai
                mencatat keuangan keluarga.
              </p>

              <Link
                href="/transactions/new"
                className="mt-5 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-medium text-white"
              >
                + Tambah Transaksi
              </Link>

            </div>
          ) : (
            <div className="divide-y">

              {transactions.map((transaction) => {
                const isIncome =
                  transaction.type === 'income'

                return (
                  <div
                    key={transaction.id}
                    className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                  >

                    {/* INFO */}
                    <div className="min-w-0">

                      <div className="flex flex-wrap items-center gap-2">

                        <h2 className="font-semibold text-gray-700">
                          {categoryMap.get(
                            transaction.category_id
                          ) ?? 'Tanpa kategori'}
                        </h2>

                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                          {isIncome
                            ? 'Pemasukan'
                            : 'Pengeluaran'}
                        </span>

                      </div>

                      <p className="mt-1 text-sm text-gray-500">
                        {accountMap.get(
                          transaction.account_id
                        ) ?? 'Rekening tidak diketahui'}
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {formatDate(
                          transaction.transaction_date
                        )}
                      </p>

                      {transaction.description && (
                        <p className="mt-2 text-sm text-gray-500">
                          {transaction.description}
                        </p>
                      )}

                    </div>

                    {/* AMOUNT + ACTION */}
                    <div className="flex items-center justify-between gap-5 md:justify-end">

                      <div className="text-right">

                        <p
                          className={`text-lg font-bold ${
                            isIncome
                              ? 'text-gray-800'
                              : 'text-gray-700'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                          {formatRupiah(
                            Number(transaction.amount)
                          )}
                        </p>

                      </div>

                      <Link
                        href={`/transactions/${transaction.id}/edit`}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-black"
                      >
                        Edit
                      </Link>

                    </div>

                  </div>
                )
              })}

            </div>
          )}

        </section>

      </div>
    </main>
  )
}