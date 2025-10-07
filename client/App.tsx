import "./global.css";
import * as React from "react";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Analyses from "./pages/Analyses";
import Rapports from "./pages/Rapports";
import Automatisation from "./pages/Automatisation";
import Repondants from "./pages/Repondants";
import Parametres from "./pages/Parametres";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { MobileNavProvider } from "@/components/MobileNavProvider";

const queryClient = new QueryClient();

const App = () => {
  const [authed, setAuthed] = React.useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("vm:authed") === "1";
    } catch (e) {
      return false;
    }
  });

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "vm:authed") {
        setAuthed(e.newValue === "1");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Render login screen until the correct password is provided
  if (!authed) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Login onSuccess={() => setAuthed(true)} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MobileNavProvider>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/analyses" element={<Analyses />} />
            <Route path="/rapports" element={<Rapports />} />
            <Route path="/automatisation" element={<Automatisation />} />
            <Route path="/repondants" element={<Repondants />} />
            <Route path="/parametres" element={<Parametres />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </MobileNavProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
