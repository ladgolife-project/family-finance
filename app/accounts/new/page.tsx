'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewAccountPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [type, setType] = useState('bank')
  const [initialBalance, setInitialBalance] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setError('')

    // Cari user yang sedang login
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Sesi login tidak ditemukan.')
      setLoading(false)
      return
    }

    // Cari keluarga user
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

    // Simpan rekening
    const { error: insertError } = await supabase
      .from('accounts')
      .insert({
        family_id: membership.family_id,
        name: name.trim(),
        type,
        initial_balance: Number(initialBalance || 0),
        is_active: true,
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Kembali ke dashboard
    router.push('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md">

        <div className="mb-6 ">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500"
          >
            ← Kembali
          </button>

          <h1 className="mt-4 text-3xl font-bold text-gray-700">
            Tambah Rekening
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Tambahkan rekening keuangan keluarga.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl bg-white p-6 shadow-sm text-gray-500"
        >

          {/* NAMA */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Nama Rekening
            </label>

            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contoh: Mandiri"
              required
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2"
            />
          </div>

          {/* JENIS */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Jenis Rekening
            </label>

            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-lg border bg-white px-4 py-3"
            >
              <option value="bank">
                Bank
              </option>

              <option value="cash">
                Cash
              </option>

              <option value="ewallet">
                E-Wallet
              </option>

              <option value="investment">
                Investasi
              </option>

              <option value="other">
                Lainnya
              </option>
            </select>
          </div>

          {/* SALDO AWAL */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Saldo Awal
            </label>

            <input
              type="number"
              min="0"
              value={initialBalance}
              onChange={(event) =>
                setInitialBalance(event.target.value)
              }
              placeholder="Contoh: 10000000"
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2"
            />

            <p className="mt-2 text-xs text-gray-400">
              Masukkan angka tanpa titik atau koma.
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan Rekening'}
          </button>

        </form>
      </div>
    </main>
  )
}