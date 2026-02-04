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
        <Dialog.Overlay className="fixed inset-0 bg-black/30 transition data-[state=closed]:opacity-0 data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:ease-out data-[state=closed]:ease-in lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-[state=closed]:-translate-x-full lg:hidden">
          <div className="flex h-full flex-col rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            <div className="-mb-3 px-4 pt-3">
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
  let [showSidebar, setShowSidebar] = useState(false)

  return (
    <div className="relative isolate flex min-h-svh w-full bg-white max-lg:flex-col lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950">
      {/* Sidebar on desktop */}
      <motion.div layoutScroll className="fixed inset-y-0 left-0 w-64 max-lg:hidden">
        {sidebar}
      </motion.div>

      {/* Sidebar on mobile */}
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      {/* Navbar on mobile */}
      <header className="flex items-center px-4 lg:hidden">
        <div className="py-2.5">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pt-2 lg:pr-2 lg:pl-64">
        <div className="grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  )
}
