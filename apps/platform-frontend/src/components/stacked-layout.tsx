import * as Dialog from '@radix-ui/react-dialog'
import { Cross2Icon, HamburgerMenuIcon } from '@radix-ui/react-icons'
import { motion } from 'motion/react'
import React, { createContext, useState } from 'react'
import { NavbarItem } from './navbar'
import { SidebarCloseContext, SidebarCollapsedContext } from './sidebar'

export const SidebarCollapseContext = createContext<{ collapsed: boolean; onToggleCollapsed: () => void }>({
  collapsed: false,
  onToggleCollapsed: () => {},
})

function OpenMenuIcon() {
  return (
    <span data-slot="icon">
      <HamburgerMenuIcon />
    </span>
  )
}

function CloseMenuIcon() {
  return (
    <span data-slot="icon">
      <Cross2Icon />
    </span>
  )
}

function MobileSidebar({ open, close, children }: React.PropsWithChildren<{ open: boolean; close: () => void }>) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? close() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[1px] transition data-[state=closed]:opacity-0 data-[state=closed]:duration-200 data-[state=closed]:ease-in data-[state=open]:duration-300 data-[state=open]:ease-out lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 w-full max-w-80 overflow-hidden bg-white transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:-translate-x-full lg:hidden dark:bg-zinc-950">
          <Dialog.Title className="sr-only">Main navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Browse projects, pages, and account actions.</Dialog.Description>
          <div className="mobile-drawer-frame flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dark:border-white/10">
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Navigation</p>
              <Dialog.Close asChild>
                <NavbarItem aria-label="Close navigation">
                  <CloseMenuIcon />
                </NavbarItem>
              </Dialog.Close>
            </div>
            <SidebarCloseContext.Provider value={true}>
              <SidebarCollapsedContext.Provider value={false}>{children}</SidebarCollapsedContext.Provider>
            </SidebarCloseContext.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function StackedLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode }>) {
  const [showSidebar, setShowSidebar] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const collapseValue = React.useMemo(
    () => ({ collapsed, onToggleCollapsed: () => setCollapsed((c) => !c) }),
    [collapsed]
  )

  return (
    <SidebarCollapseContext.Provider value={collapseValue}>
      <div className="app-canvas relative isolate flex min-h-svh w-full bg-transparent max-lg:flex-col">
        {/* Sidebar on desktop */}
        <motion.div
          animate={{ width: collapsed ? 64 : 256 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-y-0 left-0 overflow-hidden max-lg:hidden"
        >
          <SidebarCollapsedContext.Provider value={collapsed}>{sidebar}</SidebarCollapsedContext.Provider>
        </motion.div>

        {/* Sidebar on mobile */}
        <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
          {sidebar}
        </MobileSidebar>

        {/* Navbar on mobile */}
        <header className="app-topbar flex items-center px-4 lg:hidden">
          <div className="py-2.5">
            <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
              <OpenMenuIcon />
            </NavbarItem>
          </div>
          <div className="min-w-0 flex-1">{navbar}</div>
        </header>

        {/* Content */}
        <motion.main
          animate={{ paddingLeft: collapsed ? 64 : 256 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex flex-1 flex-col px-3 pt-3 pb-3 lg:min-w-0 max-lg:!pl-3"
        >
          <div className="app-frame grow p-6 lg:p-10">
            <div className="mx-auto max-w-screen-2xl">{children}</div>
          </div>
        </motion.main>
      </div>
    </SidebarCollapseContext.Provider>
  )
}
