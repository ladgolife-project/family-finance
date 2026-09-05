import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

export default async function AccountsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: familyMember } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

    if (!familyMember?.family_id) {
        return (
            <main className="min-h-screen bg-gray-50 p-8">
            <div className="mx-auto max-w-6xl">
                <p>Family belum ditemukan.</p>
            </div>
            </main>
        )
    }

  const familyId = familyMember.family_id

  const { data: accounts, error } = await supabase
    .from('account_balances')
    .select(`
      account_id,
      account_name,
      account_type,
      initial_balance,
      balance,
      is_active
    `)
    .eq('family_id', familyId)
    .order('account_name')

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-red-600">
            Gagal mengambil data rekening: {error.message}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Rekening
            </h1>
            <p className="mt-1 text-gray-500">
              Kelola rekening dan saldo keluarga
            </p>
          </div>

          <Link
            href="/accounts/new"
            className="rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-gray-800"
          >
            + Tambah Rekening
          </Link>
        </div>

        {accounts && accounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account: any) => (
              <div
                key={account.account_id}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {account.account_name}
                    </h2>

                    <p className="text-sm text-gray-500">
                      {account.account_type}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      account.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {account.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <p className="text-sm text-gray-500">
                  Saldo saat ini
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatRupiah(Number(account.balance ?? 0))}
                </p>

                <div className="mt-4 border-t pt-4">
                  <p className="text-xs text-gray-500">
                    Saldo awal
                  </p>

                  <p className="text-sm font-medium text-gray-700">
                    {formatRupiah(Number(account.initial_balance ?? 0))}
                  </p>
                </div>
                <Link
                    href={`/accounts/${account.account_id}/edit`}
                    className="mt-5 block w-full rounded-lg border px-4 py-3 text-center text-sm font-medium hover:bg-gray-50 text-gray-500"
                >
                    Edit Rekening
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Belum ada rekening
            </h2>

            <p className="mt-2 text-gray-500">
              Tambahkan rekening untuk mulai mencatat keuangan.
            </p>

            <Link
              href="/accounts/new"
              className="mt-6 inline-block rounded-lg bg-black px-5 py-3 font-medium text-white"
            >
              + Tambah Rekening
            </Link>
          </div>
        )}

      </div>
    </main>
  )
}