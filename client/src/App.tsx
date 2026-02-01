import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import EditorPage from "@/pages/editor-page";
import KernelAdminPage from "@/pages/kernel-admin-page";
import { useEffect } from "react";

function Router() {
  const [location, setLocation] = useLocation();

  // Redirect root to editor
  useEffect(() => {
    if (location === "/") {
      setLocation("/editor");
    }
  }, [location, setLocation]);

  // Debug: log current location
  console.log("[Router] Current location:", location);

  return (
    <Switch>
      <Route path="/editor" component={EditorPage} />
      <Route path="/admin/kernel">
        <ErrorBoundary>
          <KernelAdminPage />
        </ErrorBoundary>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <Toaster />
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
