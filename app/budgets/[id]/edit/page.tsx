'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DeleteBudgetButton from '@/components/delete-budget-button'

type Category = {
  id: string
  name: string
  type: string
}

export default function EditBudgetPage() {
  const router = useRouter()
  const params = useParams()

  const budgetId = params.id as string

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
  // LOAD BUDGET
  // ============================================================

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // FAMILY

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

      const familyId = membership.family_id

      // BUDGET

      const {
        data: budget,
        error: budgetError,
      } = await supabase
        .from('budgets')
        .select(`
          id,
          category_id,
          amount,
          month,
          is_active
        `)
        .eq('id', budgetId)
        .eq('family_id', familyId)
        .eq('is_active', true)
        .single()

      if (budgetError || !budget) {
        setError(
          budgetError?.message ??
            'Budget tidak ditemukan.'
        )

        setLoading(false)
        return
      }

      // CATEGORIES

      const {
        data: categoryData,
        error: categoryError,
      } = await supabase
        .from('categories')
        .select('id, name, type')
        .eq('family_id', familyId)
        .eq('type', 'expense')
        .order('name')

      if (categoryError) {
        setError(categoryError.message)
        setLoading(false)
        return
      }

      setCategories(categoryData ?? [])

      setCategoryId(budget.category_id)

      setAmount(
        String(
          Number(
            budget.amount ?? 0
          )
        )
      )

      setLoading(false)
    }

    loadData()
  }, [budgetId, router])

  // ============================================================
  // SAVE
  // ============================================================

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
      setError(
        'Sesi login tidak ditemukan.'
      )

      setSaving(false)
      return
    }

    // FAMILY

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

    const nominal = Number(amount)

    // VALIDASI

    if (!categoryId) {
      setError('Pilih kategori.')
      setSaving(false)
      return
    }

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
    // UPDATE
    // ==========================================================

    const {
      error: updateError,
    } = await supabase
      .from('budgets')
      .update({
        category_id: categoryId,
        amount: nominal,

        // Tetap recurring
        month: null,

        is_active: true,
      })
      .eq('id', budgetId)
      .eq(
        'family_id',
        membership.family_id
      )

    if (updateError) {
      if (
        updateError.code === '23505'
      ) {
        setError(
          'Kategori tersebut sudah memiliki budget aktif.'
        )
      } else {
        setError(updateError.message)
      }

      setSaving(false)
      return
    }

    router.push('/budgets')
    router.refresh()
  }

  // ============================================================
  // DELETE
  // ============================================================

  async function handleDelete() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error(
        'Sesi login tidak ditemukan.'
      )
    }

    const { data: membership } =
      await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

    if (!membership?.family_id) {
      throw new Error(
        'Data keluarga tidak ditemukan.'
      )
    }

    const {
      error: deleteError,
    } = await supabase
      .from('budgets')
      .delete()
      .eq('id', budgetId)
      .eq(
        'family_id',
        membership.family_id
      )

    if (deleteError) {
      throw new Error(
        deleteError.message
      )
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
            Memuat budget...
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
          Edit Budget
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Perubahan ini akan menjadi budget bulanan
          yang digunakan seterusnya.
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
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {/* INFO */}

          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-sm font-medium text-gray-700">
              Budget recurring
            </p>

            <p className="mt-1 text-xs leading-5 text-gray-500">
              Budget ini berlaku otomatis setiap bulan.
              Mengubah nominal akan mengubah batas
              budget bulanan tersebut.
            </p>
          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* SAVE / CANCEL */}

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
                : 'Simpan Perubahan'}
            </button>
          </div>

          {/* DELETE */}

          <div className="border-t pt-5">
            <DeleteBudgetButton
              onDelete={handleDelete}
            />
          </div>

        </form>
      </div>
    </main>
  )
}