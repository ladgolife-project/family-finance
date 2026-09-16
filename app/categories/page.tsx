import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Category = {
  id: string
  name: string
  type: string
}

export default async function CategoriesPage() {
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

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, type')
    .eq('family_id', membership.family_id)
    .order('type')
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  const incomeCategories =
    (categories ?? []).filter(
      (category) => category.type === 'income'
    )

  const expenseCategories =
    (categories ?? []).filter(
      (category) => category.type === 'expense'
    )

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-600">
      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Kategori
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Kelola kategori pemasukan dan pengeluaran.
            </p>
          </div>

          <Link
            href="/categories/new"
            className="rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-gray-800"
          >
            + Tambah Kategori
          </Link>
        </div>

        {/* PEMASUKAN */}

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Pemasukan
            </h2>

            <p className="text-sm text-gray-500">
              Kategori yang digunakan untuk transaksi pemasukan.
            </p>
          </div>

          {incomeCategories.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm">
              Belum ada kategori pemasukan.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {incomeCategories.map(
                (category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {category.name}
                      </h3>

                      <p className="mt-1 text-xs text-gray-400">
                        Pemasukan
                      </p>
                    </div>

                    <Link
                      href={`/categories/${category.id}/edit`}
                      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* PENGELUARAN */}

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Pengeluaran
            </h2>

            <p className="text-sm text-gray-500">
              Kategori yang digunakan untuk transaksi pengeluaran.
            </p>
          </div>

          {expenseCategories.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm">
              Belum ada kategori pengeluaran.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {expenseCategories.map(
                (category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {category.name}
                      </h3>

                      <p className="mt-1 text-xs text-gray-400">
                        Pengeluaran
                      </p>
                    </div>

                    <Link
                      href={`/categories/${category.id}/edit`}
                      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                  </div>
                )
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}