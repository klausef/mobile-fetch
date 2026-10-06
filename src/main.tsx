import "@vly-ai/integrations";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import { CurrentLocationProvider } from "@/components/CurrentLocationProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { Toaster } from "@/components/ui/sonner";
import { convex } from "@/lib/convex";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { InstrumentationProvider } from "@/instrumentation";
import VlyToolbar from "../vly-toolbar-readonly.tsx";
import "./index.css";

// Every screen is lazy-loaded so the first paint is the landing page rather
// than the entire authenticated app.
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Home = lazy(() => import("./pages/Home.tsx"));
const CommuterHome = lazy(() => import("./pages/CommuterHome.tsx"));
const SetLocation = lazy(() => import("./pages/SetLocation.tsx"));
const RiderRegister = lazy(() => import("./pages/RiderRegister.tsx"));
const RiderDashboard = lazy(() => import("./pages/RiderDashboard.tsx"));
const RiderOverview = lazy(() => import("./pages/RiderOverview.tsx"));
const RiderRide = lazy(() => import("./pages/RiderRide.tsx"));
const RideHistory = lazy(() => import("./pages/RideHistory.tsx"));
const Chats = lazy(() => import("./pages/Chats.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Root() {
  return (
    <StrictMode>
      <InstrumentationProvider>
        <ConvexAuthProvider client={convex}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
          >
            <LocaleProvider>
              <CurrentLocationProvider>
                <VlyToolbar />
                <BrowserRouter>
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                      <Route path="/" element={<Landing />} />

                      {/* The auth route lands on the product's home, never back
                          on the marketing page. */}
                      <Route
                        path="/auth"
                        element={<AuthPage redirectAfterAuth="/app" />}
                      />
                      <Route path="/onboarding" element={<Onboarding />} />

                      <Route
                        path="/app"
                        element={
                          <RequireAuth
                            title="Sign in to book a ride"
                            description="Your pickup, your fare and your rider all live here."
                          >
                            <Home />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/book"
                        element={
                          <RequireAuth
                            title="Sign in to book a ride"
                            description="Set your pickup and destination and see the fare before you request."
                          >
                            <CommuterHome />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/book/pickup"
                        element={
                          <RequireAuth>
                            <SetLocation step="pickup" />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/book/destination"
                        element={
                          <RequireAuth>
                            <SetLocation step="destination" />
                          </RequireAuth>
                        }
                      />

                      {/* Driver registration creates its own account, so it is
                          deliberately outside RequireAuth. */}
                      <Route
                        path="/rider/register"
                        element={<RiderRegister />}
                      />
                      <Route
                        path="/rider"
                        element={
                          <RequireAuth>
                            <RiderDashboard />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/rider/dashboard"
                        element={
                          <RequireAuth>
                            <RiderOverview />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/rider/ride"
                        element={
                          <RequireAuth>
                            <RiderRide />
                          </RequireAuth>
                        }
                      />

                      <Route
                        path="/activity"
                        element={
                          <RequireAuth>
                            <RideHistory />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/chats"
                        element={
                          <RequireAuth>
                            <Chats />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/profile"
                        element={
                          <RequireAuth>
                            <Profile />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="/admin"
                        element={
                          <RequireAuth
                            title="Sign in to open the console"
                            description="The operations console is only available to signed-in admins."
                          >
                            <AdminDashboard />
                          </RequireAuth>
                        }
                      />

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
                <Toaster />
              </CurrentLocationProvider>
            </LocaleProvider>
          </ThemeProvider>
        </ConvexAuthProvider>
      </InstrumentationProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
