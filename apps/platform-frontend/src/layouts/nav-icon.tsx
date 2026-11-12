// Radix icons need the data-slot attribute for the sidebar and menu styles to size them.
export function NavIcon({ children }: { children: React.ReactNode }) {
  // Centred, so a 15px Radix icon sits level with its label in a larger icon box.
  return (
    <span data-slot="icon" className="grid place-items-center">
      {children}
    </span>
  )
}
