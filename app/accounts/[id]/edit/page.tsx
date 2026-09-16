import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditAccountPage({
  params,
}: PageProps) {
  const { id } = await params

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

  const { data: account, error } = await supabase
    .from('accounts')
    .select(`
      id,
      name,
      type,
      initial_balance,
      is_active
    `)
    .eq('id', id)
    .eq('family_id', familyId)
    .single()

  if (error || !account) {
    redirect('/accounts')
  }

  async function updateAccount(formData: FormData) {
    'use server'

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

    const accountName =
      String(formData.get('account_name') ?? '').trim()

    const accountType =
      String(formData.get('account_type') ?? '').trim()

    const isActive =
      formData.get('is_active') === 'on'

    if (!accountName || !accountType) {
      throw new Error(
        'Nama rekening dan tipe rekening wajib diisi.'
      )
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        name: accountName,
        type: accountType,
        is_active: isActive,
      })
      .eq('id', id)
      .eq('family_id', familyMember.family_id)

    if (error) {
      throw new Error(error.message)
    }

    redirect('/accounts')
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-xl">

        <Link
          href="/accounts"
          className="text-sm text-gray-500 hover:text-black"
        >
          ← Kembali ke Rekening
        </Link>

        <h1 className="mt-4 text-3xl font-bold text-gray-600">
          Edit Rekening
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Ubah informasi rekening
        </p>

        <form
          action={updateAccount}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm text-gray-600"
        >

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nama Rekening
            </label>

            <input
              name="account_name"
              defaultValue={account.name}
              required
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tipe Rekening
            </label>

            <select
              name="account_type"
              defaultValue={account.type}
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="e-wallet">
                E-Wallet
              </option>
              <option value="investment">
                Investasi
              </option>
              <option value="other">Lainnya</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Saldo Awal
            </label>

            <input
              value={Number(
                account.initial_balance ?? 0
              ).toLocaleString('id-ID')}
              disabled
              className="w-full rounded-lg border bg-gray-100 px-4 py-3 text-gray-500"
            />

            <p className="mt-1 text-xs text-gray-500">
              Saldo awal tidak diubah di halaman ini.
            </p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={account.is_active}
              className="h-4 w-4"
            />

            <span className="text-sm font-medium">
              Rekening aktif
            </span>
          </label>

          <div className="flex gap-3 pt-3">

            <Link
              href="/accounts"
              className="flex-1 rounded-lg border px-4 py-3 text-center font-medium"
            >
              Batal
            </Link>

            <button
              type="submit"
              className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white hover:bg-gray-800"
            >
              Simpan Perubahan
            </button>

          </div>

        </form>

      </div>
    </main>
  )
}