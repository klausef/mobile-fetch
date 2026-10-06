import {
  History,
  Home,
  LayoutDashboard,
  MessageCircle,
  Navigation,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "./i18n";

/**
 * The bottom navigation's vocabulary.
 *
 * Kept out of the component file so the tab bar exports only a component:
 * the tab list is data, and it is needed by whichever screen owns the tab bar
 * (AppShell) as well as by the bar itself.
 */
export type BottomTab = {
  /** Stable identity, used to mark the active tab when tabs share a path. */
  key: string;
  to: string;
  /**
   * Which string in `dictionary.nav` names this tab. The tab bar resolves it
   * through the locale, so a screen that builds its own tab list only has to
   * know the key — never the English word.
   */
  labelKey: keyof Dictionary["nav"];
  /**
   * The English label, kept as the fallback when a caller builds a tab that is
   * not in the dictionary — and as the value the tests pin, because the bar's
   * shape should not change just because a translation landed.
   */
  label: string;
  icon: LucideIcon;
};

/**
 * The three places a commuter goes, and nothing else.
 *
 * Home is the hub and the way into booking — Ride, Pabili and Pasugo are cards
 * there rather than tabs, because a tab bar that changes the form underneath
 * itself was harder to read than a list of services you can see. Activity is
 * the trip list (ongoing first), and Chats is where a rider and a commuter talk
 * about a trip.
 *
 * Both sides of the platform get the same last two tabs: a rider keeps the
 * same Activity and Chats, with their own dashboard in place of Home.
 */
const ACTIVITY_TAB: BottomTab = {
  key: "activity",
  to: "/activity",
  labelKey: "activity",
  label: "Activity",
  icon: History,
};

/**
 * The rider's earnings, rating and vehicle.
 *
 * Split out from the booking screen on purpose. "Available booking" is a work
 * surface — a map, a go-online switch and the offers coming in — and a rider
 * checks it between trips with one thumb. The numbers answer a different
 * question ("did today pay") and are asked at the end of a shift, not while
 * waiting for the next offer. Folding them into the same screen meant the
 * earnings panel was the first thing below the fold on the screen whose whole
 * job is taking the next job.
 */
const RIDER_DASHBOARD_TAB: BottomTab = {
  key: "dashboard",
  to: "/rider/dashboard",
  labelKey: "dashboard",
  label: "Dashboard",
  // Not the booking tab's LayoutDashboard: two neighbouring tabs with the same
  // icon is a bar where the rider has to read the labels to tell them apart,
  // which defeats the point of icons. A wallet says "earnings" on its own.
  icon: Wallet,
};

const CHATS_TAB: BottomTab = {
  key: "chats",
  to: "/chats",
  labelKey: "chats",
  label: "Chats",
  icon: MessageCircle,
};

/**
 * The ride a rider is carrying, with the map for getting there.
 *
 * Only offered while they hold one. A tab that appears and disappears with the
 * state of their work is disorienting on a bar you use one-handed while
 * driving, so this rides in the first position where it is relevant and is
 * absent entirely otherwise.
 */
const ACTIVE_RIDE_TAB: BottomTab = {
  key: "ride",
  to: "/rider/ride",
  labelKey: "activeRide",
  label: "Current ride",
  icon: Navigation,
};

export const COMMUTER_TABS: BottomTab[] = [
  { key: "home", to: "/app", labelKey: "home", label: "Home", icon: Home },
  ACTIVITY_TAB,
  CHATS_TAB,
];

/**
 * Tabs for everyone else, derived from the role.
 *
 * `hasActiveRide` is passed in rather than queried here, because this module is
 * data and tests: it has no Convex client and no business acquiring one.
 */
export function roleTabs(role: string, hasActiveRide = false): BottomTab[] {
  if (role === "admin") {
    return [
      {
        key: "admin",
        to: "/admin",
        labelKey: "console",
        label: "Console",
        icon: ShieldCheck,
      },
    ];
  }
  return role === "rider"
    ? [
        {
          key: "rider",
          to: "/rider",
          // Named for what a rider opens the app to do — see what is available
          // and take it — rather than for the screen type. "Dashboard" told
          // them nothing they did not already know from the icon.
          labelKey: "available",
          label: "Available booking",
          icon: LayoutDashboard,
        },
        ...(hasActiveRide ? [ACTIVE_RIDE_TAB] : []),
        RIDER_DASHBOARD_TAB,
        ACTIVITY_TAB,
        CHATS_TAB,
      ]
    : COMMUTER_TABS;
}
