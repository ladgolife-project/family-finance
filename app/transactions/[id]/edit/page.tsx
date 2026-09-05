import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteTransactionButton from '@/components/delete-transaction-button'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditTransactionPage({
  params,
}: PageProps) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: {
      user,
    },
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

  const { data: transaction } = await supabase
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
    .eq('id', id)
    .eq('family_id', familyId)
    .single()

  if (!transaction) {
    redirect('/transactions')
  }

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, type')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('name')

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .eq('family_id', familyId)
    .order('name')

  async function updateTransaction(
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

    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      redirect('/')
    }

    const accountId =
      String(formData.get('account_id') ?? '')

    const categoryId =
      String(formData.get('category_id') ?? '')

    const type =
      String(formData.get('type') ?? '')

    const amount =
      Number(formData.get('amount') ?? 0)

    const transactionDate =
      String(formData.get('transaction_date') ?? '')

    const description =
      String(formData.get('description') ?? '')

    if (
      !accountId ||
      !categoryId ||
      !['income', 'expense'].includes(type) ||
      !amount ||
      amount <= 0 ||
      !transactionDate
    ) {
      return
    }

    const { error } = await supabase.rpc('update_transaction', {
      p_transaction_id: id,
      p_account_id: accountId,
      p_category_id: categoryId,
      p_type: type,
      p_amount: amount,
      p_transaction_date: transactionDate,
      p_description: description,
    })

    if (error) {
      throw new Error(error.message)
    }

    redirect('/transactions')
  }
  async function deleteTransaction() {
    'use server'

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const { data: member } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      redirect('/')
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('family_id', member.family_id)

    if (error) {
      throw new Error(error.message)
    }

    redirect('/transactions')
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-500">
      <div className="mx-auto max-w-2xl">

        <div className="mb-8">
          <a
            href="/transactions"
            className="text-sm text-gray-500 hover:text-black"
          >
            ← Kembali ke transaksi
          </a>

          <h1 className="mt-4 text-3xl font-bold">
            Edit Transaksi
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Ubah data transaksi keluarga
          </p>
        </div>

        <form
          action={updateTransaction}
          className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>
            <label className="mb-2 block text-sm font-medium">
              Jenis Transaksi
            </label>

            <select
              name="type"
              defaultValue={transaction.type}
              className="w-full rounded-lg border px-3 py-3"
              required
            >
              <option value="income">
                Pemasukan
              </option>

              <option value="expense">
                Pengeluaran
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Rekening
            </label>

            <select
              name="account_id"
              defaultValue={transaction.account_id}
              className="w-full rounded-lg border px-3 py-3"
              required
            >
              {accounts?.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Kategori
            </label>

            <select
              name="category_id"
              defaultValue={transaction.category_id}
              className="w-full rounded-lg border px-3 py-3"
              required
            >
              {categories?.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nominal
            </label>

            <input
              type="number"
              name="amount"
              defaultValue={transaction.amount}
              min="1"
              step="1"
              className="w-full rounded-lg border px-3 py-3"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tanggal
            </label>

            <input
              type="date"
              name="transaction_date"
              defaultValue={transaction.transaction_date}
              className="w-full rounded-lg border px-3 py-3"
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
                transaction.description ?? ''
              }
              rows={3}
              className="w-full rounded-lg border px-3 py-3"
              placeholder="Contoh: Belanja bulanan"
            />
          </div>

          <div className="flex flex-col gap-3 pt-3">

            <div className="flex gap-3">

                <a
                href="/transactions"
                className="flex-1 rounded-lg border px-4 py-3 text-center font-medium"
                >
                Batal
                </a>

                <button
                type="submit"
                className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white"
                >
                Simpan Perubahan
                </button>

            </div>

            <DeleteTransactionButton 
              action={deleteTransaction} 
            />
          </div>
        </form>
      </div>
    </main>
  )
}