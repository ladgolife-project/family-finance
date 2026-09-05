import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

const frequencyLabels: Record<string, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
}

function formatDate(date: string) {
  const [year, month, day] = date
    .split('-')
    .map(Number)

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(
    new Date(
      Date.UTC(year, month - 1, day)
    )
  )
}

type PageProps = {
  searchParams: Promise<{
    success?: string
    error?: string
  }>
}

export default async function RecurringPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

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

  const { data: recurring, error } = await supabase
    .from('recurring_transactions')
    .select(`
      id,
      name,
      type,
      amount,
      frequency,
      next_date,
      is_active,
      description
    `)
    .eq('family_id', familyId)
    .order('is_active', {
      ascending: false,
    })
    .order('next_date', {
      ascending: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  /*
   * =========================================================
   * PROCESS RECURRING
   * =========================================================
   *
   * Seluruh proses transaksi recurring sekarang ditangani
   * oleh RPC:
   *
   * process_recurring_transaction(p_recurring_id)
   *
   * RPC bertanggung jawab terhadap:
   * - autentikasi
   * - family validation
   * - recurring validation
   * - due date validation
   * - account validation
   * - category validation
   * - balance validation
   * - duplicate prevention
   * - insert transaction
   * - recurring_transaction_id
   * - advance next_date
   *
   * Semua proses tersebut berjalan secara atomic di database.
   */

  async function processRecurring(
    formData: FormData
  ) {
    'use server'

    const supabase = await createClient()

    const {
      data: {
        user,
      },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const recurringId = String(
      formData.get('recurring_id') ?? ''
    )

    if (!recurringId) {
      redirect(
        `/recurring?error=${encodeURIComponent(
          'Recurring transaction tidak valid.'
        )}`
      )
    }

    /*
     * Jalankan seluruh business logic melalui RPC.
     */
    const { error } = await supabase.rpc(
      'process_recurring_transaction',
      {
        p_recurring_id: recurringId,
      }
    )

    /*
     * Jika RPC gagal, tampilkan error dari database.
     */
    if (error) {
      redirect(
        `/recurring?error=${encodeURIComponent(
          error.message
        )}`
      )
    }

    /*
     * Query nama hanya untuk kebutuhan notifikasi UI.
     * Bukan bagian dari transaction engine.
     */
    const { data: recurring } = await supabase
      .from('recurring_transactions')
      .select('name')
      .eq('id', recurringId)
      .single()

    redirect(
      `/recurring?success=${encodeURIComponent(
        `Transaksi "${recurring?.name ?? 'Recurring'}" berhasil diproses.`
      )}`
    )
  }

  /*
   * =========================================================
   * TOGGLE RECURRING
   * =========================================================
   */

  async function toggleRecurring(
    formData: FormData
  ) {
    'use server'

    const supabase = await createClient()

    const {
      data: {
        user,
      },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const { data: membership } =
      await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

    if (!membership?.family_id) {
      redirect('/')
    }

    const recurringId = String(
      formData.get('recurring_id') ?? ''
    )

    if (!recurringId) {
      throw new Error(
        'Recurring transaction tidak valid.'
      )
    }

    const { data: current } =
      await supabase
        .from('recurring_transactions')
        .select('is_active')
        .eq('id', recurringId)
        .eq(
          'family_id',
          membership.family_id
        )
        .single()

    if (!current) {
      throw new Error(
        'Recurring transaction tidak ditemukan.'
      )
    }

    const { error } =
      await supabase
        .from('recurring_transactions')
        .update({
          is_active:
            !current.is_active,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          recurringId
        )
        .eq(
          'family_id',
          membership.family_id
        )

    if (error) {
      throw new Error(
        error.message
      )
    }

    redirect('/recurring')
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">

          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-black"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-4 text-3xl font-bold">
              Transaksi Berulang
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Kelola transaksi yang terjadi secara rutin.
            </p>
          </div>

          <Link
            href="/recurring/new"
            className="rounded-lg bg-black px-5 py-3 text-center font-medium text-white hover:bg-gray-800"
          >
            + Tambah
          </Link>

        </div>

        {/* NOTIFICATION */}

        {params.success && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <div className="flex items-start gap-2">
              <span className="font-semibold">
                ✓ Berhasil
              </span>

              <span>
                {params.success}
              </span>
            </div>
          </div>
        )}

        {params.error && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <div className="flex items-start gap-2">
              <span className="font-semibold">
                ⚠ Perhatian
              </span>

              <span>
                {params.error}
              </span>
            </div>
          </div>
        )}

        {/* LIST */}

        {(recurring ?? []).length === 0 ? (

          <section className="rounded-2xl bg-white p-10 text-center shadow-sm">

            <h2 className="text-lg font-semibold">
              Belum ada transaksi berulang
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Tambahkan gaji, tagihan,
              cicilan, atau transaksi rutin lainnya.
            </p>

          </section>

        ) : (

          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">

            <div className="divide-y">

              {(recurring ?? []).map(
                (item) => {

                  const isIncome =
                    item.type === 'income'

                  return (
                    <div
                      key={item.id}
                      className="p-5"
                    >

                      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

                        {/* INFO */}

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-2">

                            <h2 className="font-semibold text-gray-800">
                              {item.name}
                            </h2>

                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                item.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {item.is_active
                                ? 'Aktif'
                                : 'Nonaktif'}
                            </span>

                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm text-gray-500">

                            <span>
                              {isIncome
                                ? 'Pemasukan'
                                : 'Pengeluaran'}
                            </span>

                            <span>
                              •
                            </span>

                            <span>
                              {frequencyLabels[
                                item.frequency
                              ] ??
                                item.frequency}
                            </span>

                            <span>
                              •
                            </span>

                            <span>
                              Berikutnya{' '}
                              {formatDate(
                                item.next_date
                              )}
                            </span>

                          </div>

                          {item.description && (
                            <p className="mt-2 text-xs text-gray-400">
                              {item.description}
                            </p>
                          )}

                        </div>

                        {/* NOMINAL */}

                        <p
                          className={`shrink-0 text-lg font-bold ${
                            isIncome
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {isIncome
                            ? '+'
                            : '-'}{' '}
                          {formatRupiah(
                            Number(
                              item.amount
                            )
                          )}
                        </p>

                        {/* ACTIONS */}

                        <div className="flex flex-wrap gap-2">

                          {item.is_active && (
                            <form
                              action={
                                processRecurring
                              }
                            >
                              <input
                                type="hidden"
                                name="recurring_id"
                                value={item.id}
                              />

                              <button
                                type="submit"
                                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                              >
                                Proses Sekarang
                              </button>
                            </form>
                          )}

                          <Link
                            href={`/recurring/${item.id}/edit`}
                            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                          >
                            Edit
                          </Link>

                          <form
                            action={
                              toggleRecurring
                            }
                          >
                            <input
                              type="hidden"
                              name="recurring_id"
                              value={item.id}
                            />

                            <button
                              type="submit"
                              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                            >
                              {item.is_active
                                ? 'Nonaktifkan'
                                : 'Aktifkan'}
                            </button>

                          </form>

                        </div>

                      </div>

                    </div>
                  )
                }
              )}

            </div>

          </section>

        )}

      </div>
    </main>
  )
}