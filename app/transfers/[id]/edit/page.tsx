import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteTransferButton from '@/components/delete-transfer-button'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditTransferPage({
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

  // =========================================================
  // FAMILY USER
  // =========================================================

  const { data: familyMember } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!familyMember?.family_id) {
    redirect('/')
  }

  const familyId = familyMember.family_id

  // =========================================================
  // AMBIL TRANSFER
  // =========================================================

  const { data: transfer, error: transferError } = await supabase
    .from('transfers')
    .select(`
      id,
      from_account_id,
      to_account_id,
      amount,
      transfer_date,
      description
    `)
    .eq('id', id)
    .eq('family_id', familyId)
    .single()

  if (transferError || !transfer) {
    redirect('/transfers')
  }

  // =========================================================
  // AMBIL REKENING
  // =========================================================

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select(`
      id,
      name,
      type
    `)
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('name')

  if (accountsError) {
    throw new Error(accountsError.message)
  }

  // =========================================================
  // UPDATE TRANSFER
  // =========================================================

  async function updateTransfer(formData: FormData) {
    'use server'

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const fromAccountId = String(
      formData.get('from_account_id') ?? ''
    )

    const toAccountId = String(
      formData.get('to_account_id') ?? ''
    )

    const amount = Number(
      formData.get('amount') ?? 0
    )

    const transferDate = String(
      formData.get('transfer_date') ?? ''
    )

    const description = String(
      formData.get('description') ?? ''
    ).trim()

    // =======================================================
    // VALIDASI INPUT DASAR
    // =======================================================

    if (!fromAccountId || !toAccountId) {
      throw new Error(
        'Rekening sumber dan tujuan wajib dipilih.'
      )
    }

    if (fromAccountId === toAccountId) {
      throw new Error(
        'Rekening sumber dan tujuan tidak boleh sama.'
      )
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        'Nominal transfer harus lebih dari 0.'
      )
    }

    if (!transferDate) {
      throw new Error(
        'Tanggal transfer wajib diisi.'
      )
    }

    // =======================================================
    // UPDATE VIA DATABASE RPC
    // =======================================================

    const { error } = await supabase.rpc(
      'update_transfer',
      {
        p_transfer_id: id,
        p_from_account_id: fromAccountId,
        p_to_account_id: toAccountId,
        p_amount: amount,
        p_transfer_date: transferDate,
        p_description: description || null,
      }
    )

    if (error) {
      throw new Error(error.message)
    }

    redirect('/transfers')
  }

  // =========================================================
  // DELETE TRANSFER
  // =========================================================

  async function deleteTransfer() {
    'use server'

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const { error } = await supabase.rpc(
      'delete_transfer',
      {
        p_transfer_id: id,
      }
    )

    if (error) {
      throw new Error(error.message)
    }

    redirect('/transfers')
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-500">
      <div className="mx-auto max-w-xl">

        {/* =================================================
            HEADER
        ================================================= */}

        <Link
          href="/transfers"
          className="text-sm text-gray-500 hover:text-black"
        >
          ← Kembali ke Transfer
        </Link>

        <h1 className="mt-4 text-3xl font-bold text-gray-700">
          Edit Transfer
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Ubah rekening, nominal, tanggal, atau keterangan transfer.
        </p>

        {/* =================================================
            FORM
        ================================================= */}

        <form
          action={updateTransfer}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          {/* DARI REKENING */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Dari Rekening
            </label>

            <select
              name="from_account_id"
              defaultValue={transfer.from_account_id}
              required
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="">
                Pilih rekening sumber
              </option>

              {(accounts ?? []).map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* KE REKENING */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Ke Rekening
            </label>

            <select
              name="to_account_id"
              defaultValue={transfer.to_account_id}
              required
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="">
                Pilih rekening tujuan
              </option>

              {(accounts ?? []).map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* NOMINAL */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nominal
            </label>

            <input
              type="number"
              name="amount"
              min="1"
              step="1"
              defaultValue={Number(transfer.amount)}
              required
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {/* TANGGAL */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tanggal
            </label>

            <input
              type="date"
              name="transfer_date"
              defaultValue={transfer.transfer_date}
              required
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {/* KETERANGAN */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Keterangan
            </label>

            <textarea
              name="description"
              rows={3}
              defaultValue={transfer.description ?? ''}
              placeholder="Contoh: Pindah dana ke rekening tabungan"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {/* ACTION */}

          <div className="flex gap-3 pt-3">

            <Link
              href="/transfers"
              className="flex-1 rounded-lg border px-4 py-3 text-center font-medium hover:bg-gray-50"
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

        {/* =================================================
            DELETE
        ================================================= */}

        <section className="mt-6 rounded-2xl border border-red-100 bg-white p-6">

          <h2 className="font-semibold text-gray-700">
            Hapus Transfer
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Menghapus transfer akan mengembalikan saldo rekening
            sumber dan tujuan seperti sebelum transfer ini dibuat.
          </p>

          <div className="mt-4">
            <DeleteTransferButton
              action={deleteTransfer}
            />
          </div>

        </section>

      </div>
    </main>
  )
}