import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

type Account = {
  id: string
  name: string
}

type Category = {
  id: string
  name: string
  type: string
}

const frequencyLabels: Record<string, string> = {
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  yearly: 'Tahunan',
}

export default async function EditRecurringPage({
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

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!membership?.family_id) {
    redirect('/')
  }

  const familyId = membership.family_id

  const [
    { data: recurring, error: recurringError },
    { data: accounts, error: accountsError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase
      .from('recurring_transactions')
      .select(`
        id,
        family_id,
        user_id,
        account_id,
        category_id,
        type,
        amount,
        name,
        description,
        frequency,
        next_date,
        is_active
      `)
      .eq('id', id)
      .eq('family_id', familyId)
      .single(),

    supabase
      .from('accounts')
      .select('id, name')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('name'),

    supabase
      .from('categories')
      .select('id, name, type')
      .eq('family_id', familyId)
      .order('name'),
  ])

  if (recurringError || !recurring) {
    redirect('/recurring')
  }

  if (accountsError || categoriesError) {
    throw new Error(
      accountsError?.message ||
        categoriesError?.message ||
        'Gagal memuat data.'
    )
  }

  async function updateRecurring(formData: FormData) {
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

    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!member?.family_id) {
      redirect('/')
    }

    const name = String(
      formData.get('name') ?? ''
    ).trim()

    const type = String(
      formData.get('type') ?? ''
    )

    const accountId = String(
      formData.get('account_id') ?? ''
    )

    const categoryId = String(
      formData.get('category_id') ?? ''
    )

    const amount = Number(
      formData.get('amount') ?? 0
    )

    const frequency = String(
      formData.get('frequency') ?? ''
    )

    const nextDate = String(
      formData.get('next_date') ?? ''
    )

    const description = String(
      formData.get('description') ?? ''
    ).trim()

    if (!name) {
      throw new Error(
        'Nama transaksi wajib diisi.'
      )
    }

    if (!['income', 'expense'].includes(type)) {
      throw new Error(
        'Tipe transaksi tidak valid.'
      )
    }

    if (!accountId) {
      throw new Error(
        'Rekening wajib dipilih.'
      )
    }

    if (!categoryId) {
      throw new Error(
        'Kategori wajib dipilih.'
      )
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        'Nominal harus lebih dari 0.'
      )
    }

    if (
      !['weekly', 'monthly', 'yearly'].includes(
        frequency
      )
    ) {
      throw new Error(
        'Frekuensi tidak valid.'
      )
    }

    if (!nextDate) {
      throw new Error(
        'Tanggal berikutnya wajib diisi.'
      )
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('family_id', member.family_id)
      .eq('is_active', true)
      .single()

    if (!account) {
      throw new Error(
        'Rekening tidak valid.'
      )
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, type')
      .eq('id', categoryId)
      .eq('family_id', member.family_id)
      .single()

    if (!category) {
      throw new Error(
        'Kategori tidak valid.'
      )
    }

    if (category.type !== type) {
      throw new Error(
        'Tipe kategori harus sama dengan tipe transaksi.'
      )
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        account_id: accountId,
        category_id: categoryId,
        type,
        amount,
        name,
        description: description || null,
        frequency,
        next_date: nextDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('family_id', member.family_id)

    if (error) {
      throw new Error(error.message)
    }

    redirect('/recurring')
  }

  async function toggleRecurring() {
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

    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!member?.family_id) {
      redirect('/')
    }

    const { data: current } = await supabase
      .from('recurring_transactions')
      .select('is_active')
      .eq('id', id)
      .eq('family_id', member.family_id)
      .single()

    if (!current) {
      redirect('/recurring')
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        is_active: !current.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('family_id', member.family_id)

    if (error) {
      throw new Error(error.message)
    }

    redirect('/recurring')
  }

  async function deleteRecurring() {
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

    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!member?.family_id) {
      redirect('/')
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('family_id', member.family_id)

    if (error) {
      throw new Error(
        `Recurring tidak dapat dihapus: ${error.message}`
      )
    }

    redirect('/recurring')
  }

  const filteredCategories =
    (categories ?? []).filter(
      (category) =>
        category.type === recurring.type
    )

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-xl">

        <Link
          href="/recurring"
          className="text-sm text-gray-500 hover:text-black"
        >
          ← Kembali
        </Link>

        <div className="mt-4">
          <h1 className="text-3xl font-bold">
            Edit Transaksi Berulang
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Ubah pengaturan transaksi rutin.
          </p>
        </div>

        <form
          action={updateRecurring}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nama
            </label>

            <input
              type="text"
              name="name"
              defaultValue={recurring.name}
              className="w-full rounded-lg border px-4 py-3"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tipe
            </label>

            <select
              name="type"
              defaultValue={recurring.type}
              className="w-full rounded-lg border px-4 py-3"
              required
            >
              <option value="expense">
                Pengeluaran
              </option>

              <option value="income">
                Pemasukan
              </option>
            </select>

            <p className="mt-1 text-xs text-gray-400">
              Jika tipe diubah, kategori harus disesuaikan.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Rekening
            </label>

            <select
              name="account_id"
              defaultValue={recurring.account_id}
              className="w-full rounded-lg border px-4 py-3"
              required
            >
              {accounts?.map(
                (account: Account) => (
                  <option
                    key={account.id}
                    value={account.id}
                  >
                    {account.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Kategori
            </label>

            <select
              name="category_id"
              defaultValue={recurring.category_id}
              className="w-full rounded-lg border px-4 py-3"
              required
            >
              {filteredCategories.map(
                (category: Category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nominal
            </label>

            <input
              type="number"
              name="amount"
              defaultValue={Number(recurring.amount)}
              min="1"
              step="1"
              className="w-full rounded-lg border px-4 py-3"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Frekuensi
            </label>

            <select
              name="frequency"
              defaultValue={recurring.frequency}
              className="w-full rounded-lg border px-4 py-3"
              required
            >
              <option value="weekly">
                Mingguan
              </option>

              <option value="monthly">
                Bulanan
              </option>

              <option value="yearly">
                Tahunan
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tanggal Berikutnya
            </label>

            <input
              type="date"
              name="next_date"
              defaultValue={recurring.next_date}
              className="w-full rounded-lg border px-4 py-3"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Keterangan
            </label>

            <textarea
              name="description"
              defaultValue={
                recurring.description ?? ''
              }
              rows={3}
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div className="flex gap-3 pt-3">

            <Link
              href="/recurring"
              className="flex-1 rounded-lg border px-4 py-3 text-center font-medium"
            >
              Batal
            </Link>

            <button
              type="submit"
              className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white"
            >
              Simpan Perubahan
            </button>

          </div>

        </form>

        <section className="mt-5 space-y-3">

          <form action={toggleRecurring}>
            <button
              type="submit"
              className="w-full rounded-lg border px-4 py-3 font-medium hover:bg-gray-50"
            >
              {recurring.is_active
                ? 'Nonaktifkan Recurring'
                : 'Aktifkan Recurring'}
            </button>
          </form>

          <form action={deleteRecurring}>
            <button
              type="submit"
              className="w-full rounded-lg border border-red-300 px-4 py-3 font-medium text-red-600 hover:bg-red-50"
            >
              Hapus Recurring
            </button>
          </form>

        </section>

        <div className="mt-5 rounded-xl bg-gray-100 p-4 text-sm text-gray-500">
          <p>
            Status:{' '}
            <strong>
              {recurring.is_active
                ? 'Aktif'
                : 'Nonaktif'}
            </strong>
          </p>

          <p className="mt-1">
            Frekuensi:{' '}
            <strong>
              {frequencyLabels[
                recurring.frequency
              ] ?? recurring.frequency}
            </strong>
          </p>

          <p className="mt-1">
            Transaksi berikutnya:{' '}
            <strong>
              {recurring.next_date}
            </strong>
          </p>
        </div>

      </div>
    </main>
  )
}