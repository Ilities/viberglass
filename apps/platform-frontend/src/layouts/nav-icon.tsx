// Radix icons need the data-slot attribute for the sidebar and menu styles to size them.
export function NavIcon({ children }: { children: React.ReactNode }) {
  return <span data-slot="icon">{children}</span>
}
