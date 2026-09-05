  'use client'

  import { useEffect, useState } from 'react'
  import { useParams, useRouter } from 'next/navigation'
  import { createClient } from '@/lib/supabase/client'

  export default function EditCategoryPage() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const categoryId = params.id as string

    const [name, setName] = useState('')
    const [type, setType] = useState('expense')
    const [isUsed, setIsUsed] = useState(false)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
      async function loadCategory() {
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
          setError('Data keluarga tidak ditemukan.')
          setLoading(false)
          return
        }

        const { data: category, error: categoryError } =
          await supabase
            .from('categories')
            .select('id, name, type')
            .eq('id', categoryId)
            .eq('family_id', membership.family_id)
            .single()

          const { count: transactionCount } =
          await supabase
            .from('transactions')
            .select('id', {
              count: 'exact',
              head: true,
            })
            .eq('category_id', categoryId)
            .eq('family_id', membership.family_id)

          const isUsed = (transactionCount ?? 0) > 0

          if (categoryError || !category) {
            setError('Kategori tidak ditemukan.')
            setLoading(false)
            return
          }        

        setName(category.name)
        setType(category.type)
        setIsUsed((transactionCount ?? 0) > 0)
        setLoading(false)
      }

      loadCategory()
    }, [categoryId, router, supabase])

    async function handleSubmit(
      event: React.FormEvent<HTMLFormElement>
    ) {
      event.preventDefault()

      setError('')

      const cleanName = name.trim()

      if (!cleanName) {
        setError('Nama kategori wajib diisi.')
        return
      }

      setSaving(true)

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
        setError('Data keluarga tidak ditemukan.')
        setSaving(false)
        return
      }

      const { count: transactionCount } =
        await supabase
          .from('transactions')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('category_id', categoryId)
          .eq('family_id', membership.family_id)

      const categoryIsUsed =
        (transactionCount ?? 0) > 0

      const updateData = categoryIsUsed
        ? {
            name: cleanName,
          }
        : {
            name: cleanName,
            type,
          }

      const { error: updateError } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', categoryId)
        .eq('family_id', membership.family_id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }

      router.push('/categories')
      router.refresh()
    }

    async function handleDelete() {
      const confirmed = window.confirm(
        'Yakin ingin menghapus kategori ini?'
      )

      if (!confirmed) {
        return
      }

      setError('')
      setDeleting(true)

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
        setError('Data keluarga tidak ditemukan.')
        setDeleting(false)
        return
      }

      const { error: deleteError } =
        await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId)
          .eq('family_id', membership.family_id)

      if (deleteError) {
        setError(
          `Kategori tidak dapat dihapus: ${deleteError.message}`
        )
        setDeleting(false)
        return
      }

      router.push('/categories')
      router.refresh()
    }

    if (loading) {
      return (
        <main className="min-h-screen bg-gray-50 px-6 py-10">
          <div className="mx-auto max-w-xl">
            <p className="text-sm text-gray-500">
              Memuat kategori...
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

          <h1 className="mt-4 text-3xl font-bold">
            Edit Kategori
          </h1>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
          >

            <div>
              <label className="mb-2 block text-sm font-medium">
                Nama Kategori
              </label>

              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                className="w-full rounded-lg border px-4 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Tipe
              </label>

              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value)
                }
                disabled={isUsed}
                className="w-full rounded-lg border px-4 py-3 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {isUsed && (
                  <p className="mt-2 text-xs text-gray-500">
                    Tipe kategori tidak dapat diubah karena
                    kategori ini sudah digunakan dalam transaksi.
                  </p>
                )}
                <option value="expense">
                  Pengeluaran
                </option>

                <option value="income">
                  Pemasukan
                </option>
              </select>
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
                disabled={saving || deleting}
                className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving
                  ? 'Menyimpan...'
                  : 'Simpan Perubahan'}
              </button>

            </div>

            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="w-full rounded-lg border border-red-300 px-4 py-3 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting
                ? 'Menghapus...'
                : 'Hapus Kategori'}
            </button>

          </form>

        </div>
      </main>
    )
  }