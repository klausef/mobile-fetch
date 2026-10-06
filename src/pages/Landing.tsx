import { FetchBrand } from "@/components/FetchBrand";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { en } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import { Link } from "react-router";

/** Keys into `dictionary.landing`, used for a slide's two sentences. */
type LandingKey = keyof typeof en.landing;

/**
 * Slide copy, as translation keys rather than as words.
 *
 * Each slide carries its own pair of strings in every dictionary, which keeps
 * a sentence about pabili in the same place in the file as the sentence about
 * fares — so a translator can see the whole welcome flow at once instead of
 * hunting through a shared pool of unrelated strings.
 *
 * `image` is the public URL of the slide's artwork. The screen is built for one
 * image window per slide: drop each file into `public/` and set `image` here —
 * until then the branded royal-blue placeholder scene renders instead.
 */
const SLIDES: {
  titleKey: LandingKey;
  bodyKey: LandingKey;
  image?: string;
}[] = [
  { titleKey: "slide1Title", bodyKey: "slide1Body" },
  { titleKey: "slide2Title", bodyKey: "slide2Body" },
  { titleKey: "slide3Title", bodyKey: "slide3Body" },
  { titleKey: "slide4Title", bodyKey: "slide4Body" },
];

/** Four-point sparkle used across the placeholder scene. */
const SPARKLE =
  "M0 -12 C1.6 -3.6, 3.6 -1.6, 12 0 C3.6 1.6, 1.6 3.6, 0 12 C-1.6 3.6, -3.6 1.6, -12 0 C-3.6 -1.6, -1.6 -3.6, 0 -12 Z";

/**
 * Temporary stand-in artwork for the welcome carousel's illustration windows.
 * It sketches Fetch's delivery story — parcels on the move, a dotted road,
 * sparkles — in the crest palette, and disappears slide-by-slide the moment
 * real images are attached (see `SLIDES[].image`).
 */
function WelcomeScene() {
  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      {/* Sparkles */}
      <path d={SPARKLE} transform="translate(56 52) scale(1.2)" fill="#f4f4f7" />
      <path
        d={SPARKLE}
        transform="translate(210 36) scale(0.45)"
        fill="#ffc72c"
      />
      <path
        d={SPARKLE}
        transform="translate(332 46) scale(0.8)"
        fill="#f4f4f7"
        opacity="0.9"
      />
      <path
        d={SPARKLE}
        transform="translate(352 176) scale(0.55)"
        fill="#f4f4f7"
        opacity="0.75"
      />
      <path
        d={SPARKLE}
        transform="translate(46 182) scale(0.5)"
        fill="#f4f4f7"
        opacity="0.6"
      />

      {/* Motion lines trailing the parcels */}
      <g
        stroke="#ffc72c"
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.7"
      >
        <line x1="86" y1="118" x2="122" y2="118" />
        <line x1="76" y1="140" x2="118" y2="140" />
        <line x1="88" y1="162" x2="112" y2="162" />
      </g>

      {/* Parcels */}
      <g transform="rotate(-7 146 96)">
        <rect x="118" y="74" width="58" height="44" rx="8" fill="#f4f4f7" />
        <rect x="142" y="74" width="10" height="44" fill="#d9dae8" />
      </g>
      <rect x="152" y="112" width="104" height="84" rx="10" fill="#ffc72c" />
      <rect x="198" y="112" width="12" height="84" fill="#e3a715" />
      <rect x="168" y="140" width="30" height="22" rx="4" fill="#e1251b" />
      <rect x="173" y="146" width="20" height="3" rx="1.5" fill="#f4f4f7" />
      <rect
        x="173"
        y="153"
        width="13"
        height="3"
        rx="1.5"
        fill="#f4f4f7"
        opacity="0.85"
      />

      {/* Dotted road the parcels travel on */}
      <path
        d="M40 210 Q200 186 360 210"
        fill="none"
        stroke="#f4f4f7"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="1 16"
        opacity="0.45"
      />
    </svg>
  );
}

export default function Landing() {
  const t = useT();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  // Embla reports slide changes through "select"; track it so the pagination
  // pills and dots stay in step with swipes, taps, and arrow keys alike.
  useEffect(() => {
    if (!api) return;
    // Embla pattern (as in ui/carousel.tsx): report the initial slide once the
    // api exists. A one-time sync, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <div className="safe-bottom flex min-h-dvh flex-col bg-background text-foreground">
      {/* Brand + language */}
      <header className="safe-top">
        <div className="mx-auto flex w-full max-w-md items-start justify-between px-5 pt-5 sm:px-6">
          <FetchBrand size="lg" showWordmark={false} />
          {/* The language choice lives on the welcome screen as well as
              inside the app: somebody who cannot read this page cannot get as
              far as the header to change it. */}
          <LocaleSwitcher className="mt-1" />
        </div>
      </header>

      {/* Welcome carousel */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8 sm:px-6">
        <Carousel
          setApi={setApi}
          className="w-full"
          aria-label={t("landing", "carouselLabel")}
        >
          <CarouselContent>
            {SLIDES.map((slide, index) => {
              const title = t("landing", slide.titleKey);
              const body = t("landing", slide.bodyKey);
              return (
              <CarouselItem
                key={slide.titleKey}
                className="flex flex-col items-center text-center"
              >
                {/* The illustration window. */}
                <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-fetch-royal">
                  {slide.image ? (
                    <img
                      src={slide.image}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <WelcomeScene />
                  )}
                </div>
                {/* One heading per page, not one per slide. Every slide is in
                    the DOM at once, so four h1s would announce the same page
                    title four times; the first slide is the page's heading and
                    the rest are sections of the same idea. */}
                {index === 0 ? (
                  <h1 className="mt-7 text-2xl font-bold tracking-tight text-fetch-maroon sm:text-3xl">
                    {title}
                  </h1>
                ) : (
                  <h2 className="mt-7 text-2xl font-bold tracking-tight text-fetch-maroon sm:text-3xl">
                    {title}
                  </h2>
                )}
                <p className="mt-3 max-w-xs text-[15px] leading-6 text-fetch-maroon/75 sm:max-w-sm sm:text-base sm:leading-7">
                  {body}
                </p>
              </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>

        <div className="mt-8 flex items-center justify-center gap-2.5">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.titleKey}
              type="button"
              aria-label={`${t("landing", "slide")} ${index + 1} ${SLIDES.length}`}
              aria-current={current === index}
              onClick={() => api?.scrollTo(index)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                current === index
                  ? "w-8 bg-fetch-brick"
                  : "w-2 bg-fetch-brick/25 hover:bg-fetch-brick/50",
              )}
            />
          ))}
        </div>
      </main>

      {/* Consent + entry */}
      <footer className="mx-auto w-full max-w-md px-5 pb-5 sm:px-6">
        <p className="text-center text-xs leading-5 text-fetch-maroon/75">
          {t("landing", "consent")}{" "}
          <span className="font-medium underline underline-offset-2">
            {t("landing", "termOfService")}
          </span>{" "}
          &{" "}
          <span className="font-medium underline underline-offset-2">
            {t("landing", "privacyNotice")}
          </span>
          .
        </p>

        <div className="mt-4 space-y-3">
          {/* Both doors lead into /auth: the email-code flow signs existing
              users in and creates new accounts from the same form. */}
          <Button
            asChild
            className="h-12 w-full rounded-full bg-fetch-brick text-base font-bold text-white hover:bg-fetch-brick/90 sm:h-12"
          >
            <Link to="/auth">{t("landing", "cta")}</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 w-full rounded-full border-fetch-brick bg-background text-base font-bold text-fetch-brick hover:bg-fetch-brick/5 hover:text-fetch-brick sm:h-12"
          >
            <Link to="/auth">{t("landing", "ctaSignUp")}</Link>
          </Button>

          {/* Riders are a different door, not a bigger version of the same
              one: they have to go through approval before they can take a
              booking, so the path is worth naming on the front page instead of
              leaving a driver to find it. A link rather than a third button,
              because it is the rarer of the two — the page should not give
              equal visual weight to signing up and to driving. */}
          <p className="pt-1 text-center">
            <Link
              to="/rider/register"
              className="text-sm font-medium text-fetch-maroon underline underline-offset-4 transition-colors hover:text-fetch-brick"
            >
              {t("landing", "riderRegistration")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
