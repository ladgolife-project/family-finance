import Link from 'next/link'

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
  },
  {
    name: 'Transaksi',
    href: '/transactions',
  },
  {
    name: 'Berulang',
    href: '/recurring',
  },
  {
    name: 'Budget',
    href: '/budgets',
  },
  {
    name: 'Goals',
    href: '/goals',
  },
  {
    name: 'Transfer',
    href: '/transfers',
  },
  {
    name: 'Rekening',
    href: '/accounts',
  },
  {
    name: 'Laporan',
    href: '/reports',
  },
  {
    name: 'Kategori',
    href: '/categories',
  },
]

export default function MainNav() {
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-4">

        <Link
          href="/"
          className="mr-4 text-lg font-bold text-gray-700"
        >
          Family Finance
        </Link>

        <div className="flex flex-wrap gap-2">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black"
            >
              {item.name}
            </Link>
          ))}
        </div>

      </div>
    </nav>
  )
}