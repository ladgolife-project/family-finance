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

type Account = {
  id: string
  name: string
  type: string
  balance: number
  allocatedToGoals: number
  availableBalance: number
}

type Contribution = {
  id: string
  amount: number
  contribution_date: string
  description: string | null
  account_id: string
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

  const [accounts, setAccounts] = useState<Account[]>([])

  const [contributions, setContributions] = useState<
    Contribution[]
  >([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')

  const [contributionAccountId, setContributionAccountId] =
    useState('')
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
      setLoading(false)
      return
    }

    const familyId = membership.family_id

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
        .eq('family_id', familyId)
        .single()

    if (goalError || !goalData) {
      setError('Financial goal tidak ditemukan.')
      setLoading(false)
      return
    }

    const {
      data: accountData,
      error: accountError,
    } = await supabase
      .from('account_available_balances')
      .select(`
        account_id,
        account_name,
        account_type,
        balance,
        allocated_to_goals,
        available_balance,
        is_active
      `)
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('account_name', {
        ascending: true,
      })

    if (accountError) {
      setError(accountError.message)
      setLoading(false)
      return
    }

    const mappedAccounts: Account[] = (
      accountData ?? []
    ).map((account) => ({
      id: account.account_id,
      name: account.account_name,
      type: account.account_type,
      balance: Number(account.balance),
      allocatedToGoals: Number(
        account.allocated_to_goals
      ),
      availableBalance: Number(
        account.available_balance
      ),
    }))

    const {
      data: contributionData,
      error: contributionError,
    } = await supabase
      .from('financial_goal_contributions')
      .select(`
        id,
        amount,
        contribution_date,
        description,
        account_id
      `)
      .eq('goal_id', goalId)
      .eq('family_id', familyId)
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
    setAccounts(mappedAccounts)
    setName(goalData.name)
    setDescription(goalData.description ?? '')
    setTargetAmount(String(goalData.target_amount))
    setDeadline(goalData.deadline ?? '')
    setContributions(contributionData ?? [])

    if (!contributionAccountId && mappedAccounts.length > 0) {
      setContributionAccountId(mappedAccounts[0].id)
    }

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

    if (!contributionAccountId) {
      setError('Rekening sumber wajib dipilih.')
      return
    }

    const amount = Number(contributionAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Nominal kontribusi harus lebih dari 0.')
      return
    }

    if (!contributionDate) {
      setError('Tanggal kontribusi wajib diisi.')
      return
    }

    const selectedAccount = accounts.find(
      (account) =>
        account.id === contributionAccountId
    )

    if (!selectedAccount) {
      setError('Rekening sumber tidak ditemukan.')
      return
    }

    if (amount > selectedAccount.availableBalance) {
      setError(
        `Saldo tersedia ${selectedAccount.name} tidak mencukupi. Saldo yang masih bisa dialokasikan ${formatRupiah(selectedAccount.availableBalance)}.`
      )
      return
    }

    setContributing(true)

    const { error: rpcError } = await supabase.rpc(
      'add_goal_contribution',
      {
        p_goal_id: goalId,
        p_account_id: contributionAccountId,
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
      'Yakin ingin menghapus kontribusi ini? Alokasi dana ke Goal akan dikurangi kembali.'
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

    const { error: deleteError } = await supabase
      .from('financial_goals')
      .delete()
      .eq('id', goalId)
      .eq('family_id', membership.family_id)

    if (deleteError) {
      setError(
        `Gagal menghapus financial goal: ${deleteError.message}`
      )
      setDeletingGoal(false)
      return
    }

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
    Math.max(targetAmountNumber - currentAmount, 0)

  const selectedAccount = accounts.find(
    (account) =>
      account.id === contributionAccountId
  )

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
                Dana Goal
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
          className="mt-6 space-y-5 rounded-2xl bg-white p-6 shadow-sm text-gray-500"
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
            disabled={
              saving ||
              contributing ||
              deletingGoal
            }
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving
              ? 'Menyimpan...'
              : 'Simpan Perubahan'}
          </button>

        </form>

        {/* TAMBAH KONTRIBUSI */}

        <form
          onSubmit={handleContribution}
          className="mt-6 space-y-5 rounded-2xl bg-white p-6 shadow-sm"
        >

          <div>
            <h2 className="text-lg font-semibold text-gray-600">
              Alokasikan Dana
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Pilih rekening sumber untuk mengalokasikan
              dana ke goal ini.
            </p>
          </div>

          {/* REKENING SUMBER */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Rekening Sumber
            </label>

            <select
              value={contributionAccountId}
              onChange={(event) =>
                setContributionAccountId(
                  event.target.value
                )
              }
              className="w-full rounded-lg border px-4 py-3 text-gray-600"
            >
              <option value="">
                Pilih rekening
              </option>

              {accounts.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                >
                  {account.name} —{' '}
                  {formatRupiah(account.availableBalance)} tersedia
                </option>
              ))}
            </select>

            {selectedAccount && (
              <div className="mt-2 rounded-lg bg-gray-50 px-4 py-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Saldo aktual</span>
                    <span>
                      {formatRupiah(selectedAccount.balance)}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Sudah dialokasikan</span>
                    <span>
                      {formatRupiah(
                        selectedAccount.allocatedToGoals
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between border-t pt-2 font-semibold text-gray-700">
                    <span>Masih tersedia</span>
                    <span>
                      {formatRupiah(
                        selectedAccount.availableBalance
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BATAS TARGET */}

          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Target Goal</span>
                <span>
                  {formatRupiah(targetAmountNumber)}
                </span>
              </div>

              <div className="flex justify-between text-xs text-gray-500">
                <span>Dana Goal</span>
                <span>
                  {formatRupiah(currentAmount)}
                </span>
              </div>

              <div className="flex justify-between border-t pt-2 font-semibold text-gray-700">
                <span>Sisa Target</span>
                <span>
                  {formatRupiah(remaining)}
                </span>
              </div>
            </div>
          </div>

          {/* NOMINAL */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Nominal
            </label>

            <input
              type="number"
              min="1"
              value={contributionAmount}
              onChange={(event) =>
                setContributionAmount(
                  event.target.value
                )
              }
              placeholder="1000000"
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />

            {selectedAccount &&
              contributionAmount &&
              Number(contributionAmount) >
                selectedAccount.availableBalance && (
                <p className="mt-2 text-xs text-red-600">
                  Nominal melebihi saldo yang masih tersedia untuk
                  dialokasikan.
                </p>
              )}

            {contributionAmount &&
              Number(contributionAmount) > remaining && (
                <p className="mt-2 text-xs text-red-600">
                  Nominal melebihi sisa target goal.
                  Maksimal {formatRupiah(remaining)}.
                </p>
              )}

            <p className="mt-2 text-xs text-gray-400">
              Maksimal alokasi: {formatRupiah(
                Math.min(
                  selectedAccount?.availableBalance ?? 0,
                  remaining
                )
              )}
            </p>
          </div>

          {/* TANGGAL */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
              Tanggal
            </label>

            <input
              type="date"
              value={contributionDate}
              onChange={(event) =>
                setContributionDate(
                  event.target.value
                )
              }
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />
          </div>

          {/* KETERANGAN */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">
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
              className="w-full rounded-lg border px-4 py-3 text-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={
              contributing ||
              saving ||
              deletingGoal ||
              !contributionAccountId ||
              !contributionAmount ||
              Number(contributionAmount) <= 0 ||
              Number(contributionAmount) > remaining ||
              (selectedAccount
                ? Number(contributionAmount) >
                  selectedAccount.availableBalance
                : false)
            }
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {contributing
              ? 'Mengalokasikan...'
              : 'Alokasikan Dana'}
          </button>

        </form>

        {/* RIWAYAT KONTRIBUSI */}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">

          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-600">
              Riwayat Alokasi
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Histori dana yang dialokasikan ke goal.
            </p>
          </div>

          {contributions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Belum ada alokasi dana.
            </p>
          ) : (
            <div className="space-y-4">

              {contributions.map((item) => {
                const account = accounts.find(
                  (account) =>
                    account.id === item.account_id
                )

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                  >

                    <div className="min-w-0">

                      <p className="font-semibold text-green-600">
                        + {formatRupiah(Number(item.amount))}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {account?.name ||
                          'Rekening tidak ditemukan'}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(
                          item.contribution_date
                        )}
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
                        handleDeleteContribution(
                          item.id
                        )
                      }
                      disabled={
                        deletingContribution ===
                          item.id ||
                        saving ||
                        contributing ||
                        deletingGoal
                      }
                      className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingContribution ===
                      item.id
                        ? 'Menghapus...'
                        : 'Hapus'}
                    </button>

                  </div>
                )
              })}

            </div>
          )}

        </section>

        {/* DELETE GOAL */}

        <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">

          <h2 className="font-semibold text-red-700">
            Zona Berbahaya
          </h2>

          <p className="mt-1 text-sm text-red-600">
            Menghapus goal juga akan menghapus seluruh
            riwayat kontribusinya.
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