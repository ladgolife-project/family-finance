'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewGoalPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

    const cleanName = name.trim()
    const amount = Number(targetAmount)

    if (!cleanName) {
      setError('Nama goal wajib diisi.')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Target nominal harus lebih dari 0.')
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
      .from('financial_goals')
      .insert({
        family_id: membership.family_id,
        user_id: user.id,
        name: cleanName,
        description: description.trim() || null,
        target_amount: amount,
        current_amount: 0,
        deadline: deadline || null,
        is_active: true,
      })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    router.push('/goals')
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

        <h1 className="mt-4 text-3xl font-bold text-gray-700">
          Tambah Financial Goal
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Tentukan target keuangan yang ingin dicapai.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Nama Goal
            </label>

            <input
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Contoh: Dana Rumah"
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Deskripsi
            </label>

            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Contoh: DP rumah dalam 3 tahun"
              rows={3}
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Target Nominal
            </label>

            <input
              type="number"
              min="1"
              value={targetAmount}
              onChange={(event) =>
                setTargetAmount(event.target.value)
              }
              placeholder="500000000"
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Deadline
            </label>

            <input
              type="date"
              value={deadline}
              onChange={(event) =>
                setDeadline(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
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
              className="flex-1 rounded-lg border px-4 py-3 font-medium text-gray-600"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Goal'}
            </button>

          </div>

        </form>

      </div>
    </main>
  )
}