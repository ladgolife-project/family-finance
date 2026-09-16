'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Account = {
  id: string
  name: string
}

type Category = {
  id: string
  name: string
  type: string
}

export default function NewRecurringPage() {
  const router = useRouter()
  const supabase = createClient()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [type, setType] = useState('expense')
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [nextDate, setNextDate] = useState('')
  const [description, setDescription] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: membership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.family_id) {
        router.push('/')
        return
      }

      const [{ data: accountData }, { data: categoryData }] =
        await Promise.all([
          supabase
            .from('accounts')
            .select('id, name')
            .eq('family_id', membership.family_id)
            .eq('is_active', true)
            .order('name'),

          supabase
            .from('categories')
            .select('id, name, type')
            .eq('family_id', membership.family_id)
            .order('name'),
        ])

      setAccounts(accountData ?? [])
      setCategories(categoryData ?? [])
      setLoading(false)
    }

    loadData()
  }, [router, supabase])

  const filteredCategories = categories.filter(
    (category) => category.type === type
  )

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Sesi login tidak ditemukan.')
      setSaving(false)
      return
    }

    const { data: membership } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .single()

    if (!membership?.family_id) {
      setError('Data keluarga tidak ditemukan.')
      setSaving(false)
      return
    }

    const nominal = Number(amount)

    if (!name.trim()) {
      setError('Nama transaksi wajib diisi.')
      setSaving(false)
      return
    }

    if (!accountId) {
      setError('Pilih rekening.')
      setSaving(false)
      return
    }

    if (!categoryId) {
      setError('Pilih kategori.')
      setSaving(false)
      return
    }

    if (!Number.isFinite(nominal) || nominal <= 0) {
      setError('Nominal harus lebih dari 0.')
      setSaving(false)
      return
    }

    if (!nextDate) {
      setError('Tanggal transaksi berikutnya wajib diisi.')
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase
      .from('recurring_transactions')
      .insert({
        family_id: membership.family_id,
        user_id: user.id,
        account_id: accountId,
        category_id: categoryId,
        type,
        amount: nominal,
        name: name.trim(),
        description: description.trim() || null,
        frequency,
        next_date: nextDate,
        is_active: true,
      })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    router.push('/recurring')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-gray-500">
            Memuat...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-xl">

        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-black"
        >
          ← Kembali
        </button>

        <h1 className="mt-4 text-3xl font-bold text-gray-600">
          Tambah Transaksi Berulang
        </h1>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm text-gray-500"
        >

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nama
            </label>

            <input
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Contoh: Gaji Bulanan"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tipe
            </label>

            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value)
                setCategoryId('')
              }}
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="expense">
                Pengeluaran
              </option>
              <option value="income">
                Pemasukan
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Rekening
            </label>

            <select
              value={accountId}
              onChange={(event) =>
                setAccountId(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="">
                Pilih rekening
              </option>

              {accounts.map((account) => (
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
              value={categoryId}
              onChange={(event) =>
                setCategoryId(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="">
                Pilih kategori
              </option>

              {filteredCategories.map(
                (category) => (
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
              min="1"
              step="1"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              placeholder="1500000"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Frekuensi
            </label>

            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="monthly">
                Bulanan
              </option>
              <option value="weekly">
                Mingguan
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
              value={nextDate}
              onChange={(event) =>
                setNextDate(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Keterangan
            </label>

            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              rows={3}
              placeholder="Opsional"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-3">

            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-lg border px-4 py-3 font-medium"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving
                ? 'Menyimpan...'
                : 'Simpan'}
            </button>

          </div>

        </form>

      </div>
    </main>
  )
}