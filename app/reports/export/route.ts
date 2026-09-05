import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function escapeCsv(value: unknown) {
  const text = String(value ?? '')

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n')
  ) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month')

  const selectedMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7)

  const [year, monthNumber] =
    selectedMonth.split('-').map(Number)

  const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`

  const nextMonth =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json(
      { error: 'Family tidak ditemukan' },
      { status: 404 }
    )
  }

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      type,
      amount,
      transaction_date,
      description,
      category_id
    `)
    .eq('family_id', membership.family_id)
    .gte('transaction_date', startDate)
    .lt('transaction_date', nextMonth)
    .order('transaction_date', {
      ascending: false,
    })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('family_id', membership.family_id)

  const categoryMap = new Map(
    (categories ?? []).map((category) => [
      category.id,
      category.name,
    ])
  )

  const rows = [
    [
      'Tanggal',
      'Tipe',
      'Kategori',
      'Nominal',
      'Keterangan',
    ],
    ...(transactions ?? []).map((transaction) => [
      transaction.transaction_date,
      transaction.type,
      categoryMap.get(transaction.category_id) ??
        'Tanpa Kategori',
      Number(transaction.amount),
      transaction.description ?? '',
    ]),
  ]

  const csv = rows
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n')

  const filename = `laporan-${selectedMonth}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':
        'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="${filename}"`,
    },
  })
}