'use client'

type DeleteTransactionButtonProps = {
  action: () => void
}

export default function DeleteTransactionButton({
  action,
}: DeleteTransactionButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        const confirmed = window.confirm(
          'Yakin ingin menghapus transaksi ini? Data yang dihapus tidak dapat dikembalikan.'
        )

        if (confirmed) {
          action()
        }
      }}
      className="w-full rounded-lg border border-red-200 px-4 py-3 font-medium text-red-600 transition hover:bg-red-50"
    >
      Hapus Transaksi
    </button>
  )
}