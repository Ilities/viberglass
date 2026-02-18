import * as Dialog from '@radix-ui/react-dialog'
import { Cross2Icon, HamburgerMenuIcon } from '@radix-ui/react-icons'
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
          <div className="mobile-drawer-frame flex h-full flex-col">
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

export function StackedLayout({
  navbar,
  sidebar,
  children,
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode }>) {
  const [showSidebar, setShowSidebar] = useState(false)

  return (
    <div className="app-canvas relative isolate flex min-h-svh w-full flex-col bg-transparent">
      {/* Sidebar on mobile */}
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      {/* Navbar */}
      <header className="app-topbar flex items-center px-4">
        <div className="py-2.5 lg:hidden">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col px-3 pt-3 pb-3">
        <div className="app-frame grow p-6 lg:p-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  )
}
