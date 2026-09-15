import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

type Transfer = {
  id: string
  from_account_id: string
  to_account_id: string
  amount: number
  transfer_date: string
  description: string | null
}

export default async function TransfersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: familyMember } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!familyMember?.family_id) {
    redirect('/')
  }

  const familyId = familyMember.family_id

  const { data: accounts } = await supabase
    .from('accounts')
    .select(`
      id,
      name
    `)
    .eq('family_id', familyId)
    .order('name')

  const { data: transfers, error } = await supabase
    .from('transfers')
    .select(`
      id,
      from_account_id,
      to_account_id,
      amount,
      transfer_date,
      description
    `)
    .eq('family_id', familyId)
    .order('transfer_date', {
      ascending: false,
    })

  if (error) {
    throw new Error(error.message)
  }

  const accountMap = new Map(
    (accounts ?? []).map((account) => [
      account.id,
      account.name,
    ])
  )

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-500">
      <div className="mx-auto max-w-6xl">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-black"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-4 text-3xl font-bold text-gray-700">
              Transfer
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Pindahkan uang antar rekening
            </p>
          </div>

          <Link
            href="/transfers/new"
            className="rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-gray-800"
          >
            + Transfer
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">

          {(transfers ?? []).length === 0 ? (
            <div className="p-12 text-center">
              <h2 className="text-lg font-semibold text-gray-700">
                Belum ada transfer
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Transfer antar rekening akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y">

              {(transfers as Transfer[]).map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                >

                  <div className="min-w-0">
                    <p className="font-semibold text-gray-700">
                      {accountMap.get(
                        transfer.from_account_id
                      ) ?? 'Rekening sumber'}

                      {' → '}

                      {accountMap.get(
                        transfer.to_account_id
                      ) ?? 'Rekening tujuan'}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      {transfer.transfer_date}

                      {transfer.description
                        ? ` · ${transfer.description}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-5 md:justify-end">

                    <p className="font-bold text-gray-700">
                      {formatRupiah(
                        Number(transfer.amount)
                      )}
                    </p>

                    <Link
                      href={`/transfers/${transfer.id}/edit`}
                      className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </Link>

                  </div>

                </div>
              ))}

            </div>
          )}

        </section>

      </div>
    </main>
  )
}