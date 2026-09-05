'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Goal = {
  id: string
  name: string
  description: string | null
  target_amount: number
  current_amount: number
  deadline: string | null
  is_active: boolean
}

type Contribution = {
  id: string
  amount: number
  contribution_date: string
  description: string | null
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(date: string | null) {
  if (!date) return '-'

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export default function EditGoalPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const goalId = params.id as string

  const [goal, setGoal] = useState<Goal | null>(null)
  const [contributions, setContributions] = useState<
    Contribution[]
  >([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')

  const [contributionAmount, setContributionAmount] =
    useState('')
  const [contributionDate, setContributionDate] =
    useState('')
  const [contributionDescription, setContributionDescription] =
    useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contributing, setContributing] = useState(false)
  const [deletingContribution, setDeletingContribution] =
    useState<string | null>(null)
  const [deletingGoal, setDeletingGoal] = useState(false)

  const [error, setError] = useState('')

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
      setError('Data keluarga tidak ditemukan.')
      setLoading(false)
      return
    }

    const { data: goalData, error: goalError } =
      await supabase
        .from('financial_goals')
        .select(`
          id,
          name,
          description,
          target_amount,
          current_amount,
          deadline,
          is_active
        `)
        .eq('id', goalId)
        .eq('family_id', membership.family_id)
        .single()

    if (goalError || !goalData) {
      setError('Financial goal tidak ditemukan.')
      setLoading(false)
      return
    }

    const { data: contributionData, error: contributionError } =
      await supabase
        .from('financial_goal_contributions')
        .select(`
          id,
          amount,
          contribution_date,
          description
        `)
        .eq('goal_id', goalId)
        .eq('family_id', membership.family_id)
        .order('contribution_date', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        })

    if (contributionError) {
      setError(contributionError.message)
      setLoading(false)
      return
    }

    setGoal(goalData)
    setName(goalData.name)
    setDescription(goalData.description ?? '')
    setTargetAmount(String(goalData.target_amount))
    setDeadline(goalData.deadline ?? '')
    setContributions(contributionData ?? [])

    setContributionDate(
      new Date().toISOString().split('T')[0]
    )

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [goalId])

  async function handleUpdate(
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

    const { error: updateError } = await supabase
      .from('financial_goals')
      .update({
        name: cleanName,
        description: description.trim() || null,
        target_amount: amount,
        deadline: deadline || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId)
      .eq('family_id', membership.family_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    await loadData()

    setSaving(false)
  }

  async function handleContribution(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

    const amount = Number(contributionAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Nominal kontribusi harus lebih dari 0.')
      return
    }

    if (!contributionDate) {
      setError('Tanggal kontribusi wajib diisi.')
      return
    }

    setContributing(true)

    const { error: rpcError } = await supabase.rpc(
      'add_goal_contribution',
      {
        p_goal_id: goalId,
        p_amount: amount,
        p_contribution_date: contributionDate,
        p_description:
          contributionDescription.trim() || null,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setContributing(false)
      return
    }

    setContributionAmount('')
    setContributionDescription('')

    await loadData()

    setContributing(false)
  }

  async function handleDeleteContribution(
    contributionId: string
  ) {
    const confirmed = window.confirm(
      'Yakin ingin menghapus kontribusi ini? Saldo Goal akan dikurangi kembali.'
    )

    if (!confirmed) {
      return
    }

    setError('')
    setDeletingContribution(contributionId)

    const { error: rpcError } = await supabase.rpc(
      'delete_goal_contribution',
      {
        p_contribution_id: contributionId,
      }
    )

    if (rpcError) {
      setError(rpcError.message)
      setDeletingContribution(null)
      return
    }

    await loadData()

    setDeletingContribution(null)
  }

  async function handleDeleteGoal() {
    const confirmed = window.confirm(
        'Yakin ingin menghapus financial goal ini beserta seluruh riwayat kontribusinya?'
    )

    if (!confirmed) {
        return
    }

    setError('')
    setDeletingGoal(true)

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        router.push('/login')
        return
    }

    const { data: membership, error: membershipError } =
        await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .single()

    if (membershipError || !membership?.family_id) {
        setError(
        membershipError?.message ||
            'Data keluarga tidak ditemukan.'
        )
        setDeletingGoal(false)
        return
    }

    const familyId = membership.family_id

    // 1. Hapus seluruh kontribusi goal terlebih dahulu
    const { error: contributionDeleteError } =
        await supabase
        .from('financial_goal_contributions')
        .delete()
        .eq('goal_id', goalId)
        .eq('family_id', familyId)

    if (contributionDeleteError) {
        setError(
        `Gagal menghapus riwayat kontribusi: ${contributionDeleteError.message}`
        )
        setDeletingGoal(false)
        return
    }

    // 2. Setelah kontribusi terhapus, hapus goal
    const { error: goalDeleteError } = await supabase
        .from('financial_goals')
        .delete()
        .eq('id', goalId)
        .eq('family_id', familyId)

    if (goalDeleteError) {
        setError(
        `Gagal menghapus financial goal: ${goalDeleteError.message}`
        )
        setDeletingGoal(false)
        return
    }

    // 3. Kembali ke daftar goal
    router.push('/goals')
    router.refresh()
    }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-gray-500">
            Memuat financial goal...
          </p>
        </div>
      </main>
    )
  }

  if (!goal) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-xl">
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {error || 'Financial goal tidak ditemukan.'}
          </p>
        </div>
      </main>
    )
  }

  const currentAmount = Number(goal.current_amount)
  const targetAmountNumber = Number(goal.target_amount)

  const percentage =
    targetAmountNumber > 0
      ? Math.min(
          (currentAmount / targetAmountNumber) * 100,
          100
        )
      : 0

  const remaining =
    targetAmountNumber - currentAmount

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

        <div className="mt-4">
          <h1 className="text-3xl font-bold text-gray-700">
            {goal.name}
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Pantau progress dan kelola target keuangan.
          </p>
        </div>

        {/* PROGRESS */}

        <section className="mt-8 rounded-2xl bg-gray-900 p-6 text-white">

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-400">
                Terkumpul
              </p>

              <p className="mt-1 text-3xl font-bold">
                {formatRupiah(currentAmount)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-400">
                Target
              </p>

              <p className="mt-1 font-semibold">
                {formatRupiah(targetAmountNumber)}
              </p>
            </div>
          </div>

          <div className="mt-6 h-4 overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>

          <div className="mt-3 flex justify-between text-sm text-gray-400">
            <span>
              {percentage.toFixed(1)}% tercapai
            </span>

            <span>
              {remaining > 0
                ? `Sisa ${formatRupiah(remaining)}`
                : 'Target tercapai'}
            </span>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            Deadline: {formatDate(goal.deadline)}
          </p>

        </section>

        {/* EDIT GOAL */}

        <form
          onSubmit={handleUpdate}
          className="mt-6 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <h2 className="text-lg font-semibold">
            Pengaturan Goal
          </h2>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nama Goal
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
              Deskripsi
            </label>

            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              rows={3}
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Target Nominal
            </label>

            <input
              type="number"
              min="1"
              value={targetAmount}
              onChange={(event) =>
                setTargetAmount(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Deadline
            </label>

            <input
              type="date"
              value={deadline}
              onChange={(event) =>
                setDeadline(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || contributing || deletingGoal}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>

        </form>

        {/* TAMBAH KONTRIBUSI */}

        <form
          onSubmit={handleContribution}
          className="mt-6 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>
            <h2 className="text-lg font-semibold">
              Tambah Dana
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Tambahkan dana yang sudah dialokasikan ke goal ini.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Nominal
            </label>

            <input
              type="number"
              min="1"
              value={contributionAmount}
              onChange={(event) =>
                setContributionAmount(event.target.value)
              }
              placeholder="1000000"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Tanggal
            </label>

            <input
              type="date"
              value={contributionDate}
              onChange={(event) =>
                setContributionDate(event.target.value)
              }
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Keterangan
            </label>

            <input
              type="text"
              value={contributionDescription}
              onChange={(event) =>
                setContributionDescription(
                  event.target.value
                )
              }
              placeholder="Contoh: Tabungan bulan September"
              className="w-full rounded-lg border px-4 py-3"
            />
          </div>

          <button
            type="submit"
            disabled={contributing || saving || deletingGoal}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {contributing
              ? 'Menambahkan...'
              : 'Tambah Dana'}
          </button>

        </form>

        {/* RIWAYAT KONTRIBUSI */}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="text-lg font-semibold">
              Riwayat Kontribusi
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Semua dana yang pernah ditambahkan ke goal.
            </p>
          </div>

          {contributions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Belum ada kontribusi.
            </p>
          ) : (
            <div className="space-y-4">

              {contributions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                >

                  <div className="min-w-0">
                    <p className="font-semibold text-green-600">
                      + {formatRupiah(Number(item.amount))}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {formatDate(item.contribution_date)}
                    </p>

                    {item.description && (
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteContribution(item.id)
                    }
                    disabled={
                      deletingContribution === item.id ||
                      saving ||
                      contributing ||
                      deletingGoal
                    }
                    className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingContribution === item.id
                      ? 'Menghapus...'
                      : 'Hapus'}
                  </button>

                </div>
              ))}

            </div>
          )}

        </section>

        {/* DELETE GOAL */}

        <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">

          <h2 className="font-semibold text-red-700">
            Zona Berbahaya
          </h2>

          <p className="mt-1 text-sm text-red-600">
            Menghapus goal juga akan menghapus seluruh riwayat
            kontribusinya.
          </p>

          <button
            type="button"
            onClick={handleDeleteGoal}
            disabled={
              deletingGoal ||
              saving ||
              contributing
            }
            className="mt-4 w-full rounded-lg border border-red-300 bg-white px-4 py-3 font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            {deletingGoal
              ? 'Menghapus...'
              : 'Hapus Financial Goal'}
          </button>

        </section>

      </div>
    </main>
  )
}