import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import EditorPage from "@/pages/editor-page";
import { useEffect } from "react";

function Router() {
  const [location, setLocation] = useLocation();

  // Redirect root to editor
  useEffect(() => {
    if (location === "/") {
      setLocation("/editor");
    }
  }, [location, setLocation]);

  return (
    <Switch>
      <Route path="/editor" component={EditorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
