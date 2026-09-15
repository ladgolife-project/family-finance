'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Account = {
  id: string
  name: string
}

type Category = {
  id: string
  name: string
  type: 'income' | 'expense'
}

function getRpcErrorMessage(message: string) {
  if (
    message.includes('Saldo rekening tidak mencukupi') ||
    message.includes('Saldo tersedia tidak mencukupi')
  ) {
    return 'Saldo tersedia tidak mencukupi untuk transaksi ini.'
  }

  if (message.includes('Rekening tidak ditemukan')) {
    return 'Rekening tidak ditemukan atau sudah tidak aktif.'
  }

  if (message.includes('Kategori tidak ditemukan')) {
    return 'Kategori tidak ditemukan.'
  }

  if (message.includes('Kategori bukan milik keluarga')) {
    return 'Kategori tidak dapat digunakan.'
  }

  if (message.includes('Jenis kategori tidak sesuai')) {
    return 'Kategori tidak sesuai dengan jenis transaksi.'
  }

  if (message.includes('Sesi login tidak ditemukan')) {
    return 'Sesi login berakhir. Silakan login kembali.'
  }

  if (message.includes('Keluarga user tidak ditemukan')) {
    return 'Data keluarga tidak ditemukan.'
  }

  return 'Transaksi gagal disimpan. Silakan coba lagi.'
}

export default function NewTransactionPage() {
  const router = useRouter()
  const supabase = createClient()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toLocaleDateString('en-CA')
  )
  const [description, setDescription] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => category.type === type)
  }, [categories, type])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const categoryStillValid = filteredCategories.some(
      (category) => category.id === categoryId
    )

    if (!categoryStillValid) {
      setCategoryId(filteredCategories[0]?.id ?? '')
    }
  }, [type, filteredCategories, categoryId])

  async function loadData() {
    setLoading(true)
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Sesi login tidak ditemukan. Silakan login kembali.')
      setLoading(false)
      return
    }

    const { data: membership, error: membershipError } =
      await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

    if (membershipError || !membership) {
      setError('Keluarga user tidak ditemukan.')
      setLoading(false)
      return
    }

    const { data: accountData, error: accountError } =
      await supabase
        .from('accounts')
        .select('id, name')
        .eq('family_id', membership.family_id)
        .eq('is_active', true)
        .order('name')

    if (accountError) {
      setError('Gagal memuat data rekening.')
      setLoading(false)
      return
    }

    const { data: categoryData, error: categoryError } =
      await supabase
        .from('categories')
        .select('id, name, type')
        .eq('family_id', membership.family_id)
        .order('name')

    if (categoryError) {
      setError('Gagal memuat data kategori.')
      setLoading(false)
      return
    }

    setAccounts(accountData ?? [])
    setCategories((categoryData ?? []) as Category[])

    if (accountData && accountData.length > 0) {
      setAccountId(accountData[0].id)
    }

    const expenseCategories = (categoryData ?? []).filter(
      (category) => category.type === 'expense'
    )

    if (expenseCategories.length > 0) {
      setCategoryId(expenseCategories[0].id)
    }

    setLoading(false)
  }

  function validateForm() {
    if (!accountId) {
      return 'Pilih rekening terlebih dahulu.'
    }

    if (!categoryId) {
      return 'Pilih kategori terlebih dahulu.'
    }

    if (!['income', 'expense'].includes(type)) {
      return 'Jenis transaksi tidak valid.'
    }

    const nominal = Number(amount)

    if (!Number.isFinite(nominal) || nominal <= 0) {
      return 'Nominal harus lebih dari 0.'
    }

    if (!Number.isInteger(nominal)) {
      return 'Nominal harus berupa angka bulat.'
    }

    if (!transactionDate) {
      return 'Tanggal transaksi wajib diisi.'
    }

    const selectedCategory = categories.find(
      (category) => category.id === categoryId
    )

    if (!selectedCategory) {
      return 'Kategori tidak ditemukan.'
    }

    if (selectedCategory.type !== type) {
      return 'Kategori tidak sesuai dengan jenis transaksi.'
    }

    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saving) {
      return
    }

    setError('')

    const validationError = validateForm()

    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    const nominal = Number(amount)

    const { error: rpcError } = await supabase.rpc(
      'create_transaction',
      {
        p_account_id: accountId,
        p_category_id: categoryId,
        p_type: type,
        p_amount: nominal,
        p_transaction_date: transactionDate,
        p_description: description.trim() || null,
      }
    )

    if (rpcError) {
      setError(getRpcErrorMessage(rpcError.message))
      setSaving(false)
      return
    }

    router.push('/transactions')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          Memuat data transaksi...
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md">

        {/* HEADER */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-black disabled:opacity-50"
          >
            ← Kembali
          </button>

          <h1 className="mt-4 text-3xl font-bold text-gray-700">
            Tambah Transaksi
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Catat pemasukan atau pengeluaran keluarga.
          </p>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          {/* TYPE */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-500">
              Jenis Transaksi
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                disabled={saving}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  type === 'expense'
                    ? 'bg-black text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Pengeluaran
              </button>

              <button
                type="button"
                onClick={() => setType('income')}
                disabled={saving}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  type === 'income'
                    ? 'bg-black text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Pemasukan
              </button>
            </div>
          </div>

          {/* ACCOUNT */}
          <div>
            <label
              htmlFor="account"
              className="mb-2 block text-sm font-medium text-gray-500"
            >
              Rekening
            </label>

            <select
              id="account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={saving || accounts.length === 0}
              required
              className="w-full rounded-lg border bg-white px-4 py-3 text-gray-700 outline-none focus:border-black disabled:opacity-50"
            >
              <option value="">
                Pilih rekening
              </option>

              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            {accounts.length === 0 && (
              <p className="mt-2 text-xs text-red-500">
                Belum ada rekening aktif.
              </p>
            )}
          </div>

          {/* CATEGORY */}
          <div>
            <label
              htmlFor="category"
              className="mb-2 block text-sm font-medium text-gray-500"
            >
              Kategori
            </label>

            <select
              id="category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={saving || filteredCategories.length === 0}
              required
              className="w-full rounded-lg border bg-white px-4 py-3 text-gray-700 outline-none focus:border-black disabled:opacity-50"
            >
              <option value="">
                Pilih kategori
              </option>

              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {filteredCategories.length === 0 && (
              <p className="mt-2 text-xs text-red-500">
                Belum ada kategori untuk jenis transaksi ini.
              </p>
            )}
          </div>

          {/* AMOUNT */}
          <div>
            <label
              htmlFor="amount"
              className="mb-2 block text-sm font-medium text-gray-500"
            >
              Nominal
            </label>

            <input
              id="amount"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Contoh: 50000"
              disabled={saving}
              required
              className="w-full rounded-lg border px-4 py-3 text-gray-700 outline-none focus:border-black disabled:opacity-50"
            />

            <p className="mt-2 text-xs text-gray-400">
              Masukkan angka tanpa titik atau koma.
            </p>
          </div>

          {/* DATE */}
          <div>
            <label
              htmlFor="transaction-date"
              className="mb-2 block text-sm font-medium text-gray-500"
            >
              Tanggal
            </label>

            <input
              id="transaction-date"
              type="date"
              value={transactionDate}
              onChange={(event) =>
                setTransactionDate(event.target.value)
              }
              disabled={saving}
              required
              className="w-full rounded-lg border px-4 py-3 text-gray-700 outline-none focus:border-black disabled:opacity-50"
            />
          </div>

          {/* DESCRIPTION */}
          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-gray-500"
            >
              Catatan
            </label>

            <textarea
              id="description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Contoh: Belanja kebutuhan dapur"
              rows={3}
              disabled={saving}
              className="w-full resize-none rounded-lg border px-4 py-3 text-gray-700 outline-none focus:border-black disabled:opacity-50"
            />
          </div>

          {/* ERROR */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={
              saving ||
              accounts.length === 0 ||
              filteredCategories.length === 0
            }
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Menyimpan transaksi...' : 'Simpan Transaksi'}
          </button>

        </form>
      </div>
    </main>
  )
}