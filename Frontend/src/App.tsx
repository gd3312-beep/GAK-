import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";

const Welcome = lazy(() => import("./pages/Welcome"));
const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const Ahara = lazy(() => import("./pages/Ahara"));
const Karma = lazy(() => import("./pages/Karma"));
const Gyaan = lazy(() => import("./pages/Gyaan"));
const Marks = lazy(() => import("./pages/Marks"));
const Planner = lazy(() => import("./pages/Planner"));
const Profile = lazy(() => import("./pages/Profile"));
const HistoryWorkout = lazy(() => import("./pages/HistoryWorkout"));
const HistoryNutrition = lazy(() => import("./pages/HistoryNutrition"));
const HistoryAcademic = lazy(() => import("./pages/HistoryAcademic"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="dark" storageKey="gka-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense
            fallback={(
              <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
                Loading...
              </div>
            )}
          >
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/home" element={<Home />} />
              <Route path="/ahara" element={<Ahara />} />
              <Route path="/karma" element={<Karma />} />
              <Route path="/gyaan" element={<Gyaan />} />
              <Route path="/marks" element={<Marks />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/history/workout" element={<HistoryWorkout />} />
              <Route path="/history/nutrition" element={<HistoryNutrition />} />
              <Route path="/history/academic" element={<HistoryAcademic />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
