'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewCategoryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [type, setType] = useState('expense')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

    const { error: insertError } = await supabase
      .from('categories')
      .insert({
        family_id: membership.family_id,
        name: cleanName,
        type,
      })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    router.push('/categories')
    router.refresh()
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
          Tambah Kategori
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
              placeholder="Contoh: Makan"
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