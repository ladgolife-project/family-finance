'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Category = {
  id: string
  name: string
  type: string
}

export default function NewBudgetPage() {
  const router = useRouter()
  const supabase = createClient()

  const [categories, setCategories] =
    useState<Category[]>([])

  const [categoryId, setCategoryId] =
    useState('')

  const [amount, setAmount] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  // ============================================================
  // LOAD DATA
  // ============================================================

  useEffect(() => {
    async function loadCategories() {
      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: membership } =
        await supabase
          .from('family_members')
          .select('family_id')
          .eq('user_id', user.id)
          .single()

      if (!membership?.family_id) {
        router.push('/')
        return
      }

      const { data, error } =
        await supabase
          .from('categories')
          .select(
            'id, name, type'
          )
          .eq(
            'family_id',
            membership.family_id
          )
          .eq(
            'type',
            'expense'
          )
          .order('name')

      if (error) {
        setError(
          error.message
        )
      }

      setCategories(data ?? [])
      setLoading(false)
    }

    loadCategories()
  }, [router, supabase])

  // ============================================================
  // SUBMIT
  // ============================================================

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setSaving(true)

    const {
      data: { user },
    } =
      await supabase.auth.getUser()

    if (!user) {
      setError(
        'Sesi login tidak ditemukan.'
      )
      setSaving(false)
      return
    }

    const { data: membership } =
      await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

    if (!membership?.family_id) {
      setError(
        'Data keluarga tidak ditemukan.'
      )
      setSaving(false)
      return
    }

    const nominal =
      Number(amount)

    // VALIDASI KATEGORI

    if (!categoryId) {
      setError(
        'Pilih kategori.'
      )
      setSaving(false)
      return
    }

    // VALIDASI NOMINAL

    if (
      !Number.isFinite(nominal) ||
      nominal <= 0
    ) {
      setError(
        'Nominal budget harus lebih dari 0.'
      )
      setSaving(false)
      return
    }

    // ==========================================================
    // INSERT RECURRING BUDGET
    // ==========================================================

    const {
      error: insertError,
    } =
      await supabase
        .from('budgets')
        .insert({
          family_id:
            membership.family_id,
          category_id:
            categoryId,
          user_id: user.id,
          amount: nominal,

          // NULL = RECURRING
          month: null,

          is_active: true,
        })

    if (insertError) {

      if (
        insertError.code ===
        '23505'
      ) {
        setError(
          'Kategori tersebut sudah memiliki budget aktif.'
        )
      } else {
        setError(
          insertError.message
        )
      }

      setSaving(false)
      return
    }

    router.push('/budgets')
    router.refresh()
  }

  // ============================================================
  // LOADING
  // ============================================================

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

  // ============================================================
  // RENDER
  // ============================================================

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

        <h1 className="mt-4 text-3xl font-bold">
          Tambah Budget
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Budget yang dibuat akan otomatis berlaku
          setiap bulan.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          {/* KATEGORI */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Kategori
            </label>

            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(
                  event.target.value
                )
              }
              className="w-full rounded-lg border px-4 py-3"
            >
              <option value="">
                Pilih kategori
              </option>

              {categories.map(
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

          {/* NOMINAL */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nominal Budget Bulanan
            </label>

            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(event) =>
                setAmount(
                  event.target.value
                )
              }
              placeholder="1000000"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {/* INFO */}

          <div className="rounded-lg bg-gray-50 px-4 py-3">

            <p className="text-sm font-medium text-gray-700">
              Budget recurring
            </p>

            <p className="mt-1 text-xs leading-5 text-gray-500">
              Budget ini tidak terikat pada bulan tertentu.
              Setelah dibuat, budget otomatis digunakan
              setiap bulan sampai kamu mengubahnya.
            </p>

          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* BUTTON */}

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
                : 'Simpan Budget'}
            </button>

          </div>

        </form>

      </div>

    </main>
  )
}