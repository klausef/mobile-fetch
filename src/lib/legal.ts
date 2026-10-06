/**
 * The two legal documents, as short and as true as we can make them.
 *
 * Every app needs these two rows, and the temptation is to fill them with
 * language borrowed from a policy template: a wall of words that says nothing,
 * and that would be wrong the first time a feature changed. So these say what
 * this deployment actually does — cash fares, location only while somebody is
 * on a trip, one emergency contact shown only to the rider carrying you.
 *
 * Plain data rather than JSX, for three reasons: it can be unit tested (the
 * invariant that matters is that both languages carry the same paragraphs, or
 * a Bisaya reader silently gets a shorter document), it can be corrected
 * without touching a component, and it stays out of the bundle unless a row is
 * actually opened.
 *
 * Kept beside the other pure modules on purpose. Nothing here imports React or
 * Convex, so a test can read it directly.
 */
import type { Locale } from "@/lib/i18n/locale";

export type LegalKind = "terms" | "privacy";

type LegalDocument = Record<Locale, string[]>;

export const LEGAL: Record<LegalKind, LegalDocument> = {
  terms: {
    en: [
      "Fetch is a ride-hailing and errand service run for Bukidnon. A request asks for a driver; it does not promise one. If no rider accepts, the request stays open until you cancel it.",
      "The fare is worked out before you request and shown on screen. It only moves if the route does — a rider correcting a pickup or a store pin can change it, and you see the new amount before the trip ends.",
      "Fares are settled in cash with the rider. Fetch does not store your card details and does not charge you through the app.",
      "Riders carry passengers only after the Fetch team has verified their licence and their vehicle.",
      "Cancelling a request is free, at any point before a rider accepts.",
    ],
    ceb: [
      "Ang Fetch usa ka serbisyo sa ride ug errand para sa Bukidnon. Ang request usa ka pagpangayo og driver, dili garantiya nga adunay. Kung walay rider nga naka-accept, open ra ang request hangtang is-kansela nimo siya.",
      "Kalkulado na ang fare sa wala pa ka nga nag-request, at nakita mo na siya sa screen. Mahimong baguhin lang kung bag-o ang ruta — kon ang rider ni-tama ang pickup o ang store pin, makikita mo ang bag-o nga amount sa dili pa matapos ang biyahe.",
      "Cash ang bayad ngadto sa rider. Wala kay card details hauldin ang Fetch, ug wala ka ning siyang charge-an sa app.",
      "Ang mga rider nga naka-verify sa Fetch team — ang ilang license ug vehicle — lamang ang naka-carry og pasahero.",
      "Free ang pag-kansela, bisan saan pa sa dili pa naka-accept ang rider.",
    ],
  },
  privacy: {
    en: [
      "We store your name, your mobile number, your email address, and your profile photo if you add one.",
      "Your location is recorded while you are on a trip, so the rider and the person waiting can see each other. It is not recorded while you are offline or browsing.",
      "Your emergency contact is shown to the rider only while they are carrying you. Nobody else can see it, and it never appears on a receipt.",
      "We do not sell your data, and we do not use your location for advertising.",
      "You can change your name and number, or remove your photo, at any time from your profile.",
    ],
    ceb: [
      "Gi-store nami ang imong ngalan, numero sa cellphone, email address, ug ang profile photo kung mag-add ka.",
      "Gi-record ang imong lokasyon samtang naka-trip ka, aron makita ka niya nga kag partner. Dili nga gi-record samtang offline ka o nagatan-aw lang.",
      "Ang imong emergency contact makita lang sa rider samtang gipapatakbo niya ka. Wala gyud siyang laing makita, ug wala man siya sa receipt.",
      "Wala among gipagbaligya sa imong data, ug wala among nagamit sa imong lokasyon para sa advertisements.",
      "Pwede nimo palaging bag-uhon ang imong ngalan ug numero, o tanggalon ang photo, gikan sa imong profile.",
    ],
  },
};

/** The paragraphs of one document, in the reader's language. */
export function legalFor(kind: LegalKind, locale: Locale): string[] {
  return LEGAL[kind][locale] ?? LEGAL[kind].en;
}
