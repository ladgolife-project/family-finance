import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

export default async function GoalsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!membership?.family_id) {
    redirect('/')
  }

  const { data: goals, error } = await supabase
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
    .eq('family_id', membership.family_id)
    .eq('is_active', true)
    .order('deadline', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-black"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-4 text-3xl font-bold text-gray-700">
              Financial Goals
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Rencanakan dan pantau target keuangan keluarga.
            </p>
          </div>

          <Link
            href="/goals/new"
            className="rounded-lg bg-black px-5 py-3 text-center font-medium text-white hover:bg-gray-800"
          >
            + Tambah Goal
          </Link>
        </div>

        {/* GOALS */}

        {(goals ?? []).length === 0 ? (
          <section className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-700">
              Belum ada financial goal
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Buat target seperti dana rumah, pendidikan,
              liburan, atau dana darurat.
            </p>

            <Link
              href="/goals/new"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 text-sm font-medium text-white"
            >
              Buat Goal Pertama
            </Link>
          </section>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">

            {(goals ?? []).map((goal) => {
              const target = Number(goal.target_amount)
              const current = Number(goal.current_amount)

              const percentage =
                target > 0
                  ? Math.min((current / target) * 100, 100)
                  : 0

              return (
                <Link
                  key={goal.id}
                  href={`/goals/${goal.id}/edit`}
                  className="rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">

                    <div>
                      <h2 className="text-lg font-semibold text-gray-700">
                        {goal.name}
                      </h2>

                      {goal.description && (
                        <p className="mt-1 text-sm text-gray-500">
                          {goal.description}
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      Aktif
                    </span>

                  </div>

                  <div className="mt-6">

                    <div className="flex items-end justify-between gap-3">

                      <div>
                        <p className="text-xs text-gray-500">
                          Dana Goal
                        </p>

                        <p className="mt-1 text-xl font-bold text-gray-700">
                          {formatRupiah(current)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          Target
                        </p>

                        <p className="mt-1 font-semibold text-gray-700">
                          {formatRupiah(target)}
                        </p>
                      </div>

                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-black"
                        style={{
                          width: `${percentage}%`,
                        }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">

                      <span>
                        {percentage.toFixed(1)}% tercapai
                      </span>

                      <span>
                        Deadline: {formatDate(goal.deadline)}
                      </span>

                    </div>

                  </div>
                </Link>
              )
            })}

          </div>
        )}

      </div>
    </main>
  )
}