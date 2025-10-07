import React from 'react';

const MobileNavContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
} | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);
  return (
    <MobileNavContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = React.useContext(MobileNavContext);
  if (!ctx) throw new Error('useMobileNav must be used inside MobileNavProvider');
  return ctx;
}
