import * as Dialog from '@radix-ui/react-dialog'
import { HamburgerMenuIcon, Cross2Icon } from '@radix-ui/react-icons'
import { motion } from 'motion/react'
import React, { useState } from 'react'
import { NavbarItem } from './navbar'
import { SidebarCloseContext } from './sidebar'

function OpenMenuIcon() {
  return <span data-slot="icon"><HamburgerMenuIcon /></span>
}

function CloseMenuIcon() {
  return <span data-slot="icon"><Cross2Icon /></span>
}

function MobileSidebar({ open, close, children }: React.PropsWithChildren<{ open: boolean; close: () => void }>) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => (!nextOpen ? close() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[1px] transition data-[state=closed]:opacity-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:ease-out data-[state=closed]:ease-in lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 w-full max-w-80 overflow-hidden bg-white transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:-translate-x-full dark:bg-zinc-950 lg:hidden">
          <Dialog.Title className="sr-only">Main navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Browse projects, pages, and account actions.</Dialog.Description>
          <div className="mobile-drawer-frame flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-white/10">
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Navigation</p>
              <Dialog.Close asChild>
                <NavbarItem aria-label="Close navigation">
                  <CloseMenuIcon />
                </NavbarItem>
              </Dialog.Close>
            </div>
            <SidebarCloseContext.Provider value={true}>{children}</SidebarCloseContext.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function SidebarLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode }>) {
  const [showSidebar, setShowSidebar] = useState(false)

  return (
    <div className="app-canvas relative isolate flex min-h-svh w-full bg-transparent max-lg:flex-col">
      {/* Sidebar on desktop */}
      <motion.div layoutScroll className="fixed inset-y-0 left-0 w-64 max-lg:hidden">
        {sidebar}
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
      <main className="flex flex-1 flex-col px-3 pt-3 pb-3 lg:min-w-0 lg:pl-64">
        <div className="app-frame grow p-6 lg:p-10">
          {/* App-wide max-width — individual pages use narrower max-w-* on their own containers */}
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  )
}
