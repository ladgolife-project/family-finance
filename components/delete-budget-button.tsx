'use client'

import { useState } from 'react'

type DeleteBudgetButtonProps = {
  onDelete: () => Promise<void>
}

export default function DeleteBudgetButton({
  onDelete,
}: DeleteBudgetButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      'Yakin ingin menghapus budget ini? Budget akan berhenti digunakan setiap bulan.'
    )

    if (!confirmed) {
      return
    }

    setIsDeleting(true)

    try {
      await onDelete()
    } catch (error) {
      setIsDeleting(false)

      alert(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus budget.'
      )
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="w-full rounded-lg border border-red-200 px-4 py-3 font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isDeleting ? 'Menghapus...' : 'Hapus Budget'}
    </button>
  )
}