import { ProfileView } from "@/components/profile/ProfileView";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate } from "react-router";
import { useT } from "@/lib/i18n/LocaleProvider";

/**
 * "/profile" — the account as its own screen.
 *
 * The content used to live here, 599 lines of it. It now lives in
 * `components/profile/ProfileView.tsx`, because the header's account panel
 * needs the same content: tapping "Profile" in that panel used to navigate here
 * and stack a whole second account surface — its own gold bar, its own back
 * button — on top of the panel underneath. The panel now swaps its own contents
 * for the view instead, and this route stays for the times a full page is
 * genuinely wanted: a shared link, or a back button that has somewhere to go.
 *
 * So this file is only the chrome. Anything that belongs to the account itself
 * belongs in the view, or it will drift between the two surfaces again.
 */
export default function Profile() {
  const t = useT();
  const { isAdmin } = useOwnerAdmin();
  const profile = useQuery(api.profiles.getMyProfile);
  const navigate = useNavigate();

  // Back goes where the person came from when there is somewhere to go back to,
  // and to the app rather than out of it when the link was shared.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(isAdmin ? "/admin" : profile?.role === "rider" ? "/rider" : "/app");
  };

  // A signed-in account with no profile row has no name, no number and nothing
  // to edit, and every save here would be refused by the server. Send them
  // where that gets fixed rather than showing a half-empty account.
  if (profile === null) return <Navigate to="/onboarding" replace />;

  return (
    <div className="min-h-dvh bg-muted/40 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      {/* The crest's gold, in the position the big apps put their brand bar:
          the one strip of colour that says "you are somewhere specific". */}
      <div className="safe-top sticky top-0 z-30 bg-fetch-gold text-fetch-ink">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-3 sm:h-16 sm:px-4">
          <button
            type="button"
            onClick={goBack}
            aria-label={t("common", "back")}
            className="-ml-1 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fetch-ink/40"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight">
            {t("profile", "title")}
          </h1>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <ProfileView />
      </main>
    </div>
  );
}
