/**
 * The English strings.
 *
 * This object is the shape every other language has to match. `ceb.ts` is
 * typed as `Dictionary`, so adding a key here without adding it there is a
 * compile error rather than an English word leaking into the Bisaya build.
 *
 * Keys are grouped by the screen that uses them, and named after what the
 * control *is* rather than where it sits, so a layout change does not force a
 * rename.
 */

export const en = {
  common: {
    continue: "Continue",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    retry: "Try again",
    loading: "Loading…",
    back: "Back",
    optional: "optional",
    search: "Search",
    remove: "Remove",
    add: "Add",
    edit: "Edit",
    none: "None",
  },

  nav: {
    home: "Book",
    activity: "Trips",
    chats: "Chats",
    // The rider's tab is the work itself: the bookings waiting to be taken.
    // Named for that, not for the screen type.
    available: "Booking",
    activeRide: "Current ride",
    dashboard: "Dashboard",
    console: "Console",
  },

  settings: {
    title: "Settings",
    profile: "Profile",
    language: "Language",
    appearance: "Appearance",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    openSettings: "Open settings",
    close: "Close settings",
  },

  landing: {
    tagline: "Bukidnon's ride-hailing and errand service",
    cta: "Log in",
    ctaSignUp: "I'm new, sign me up",
    riderRegistration: "Rider registration",
    ctaSignIn: "I already have an account",
    languageLabel: "Language",
    carouselLabel: "About Fetch",
    slide: "Go to slide",
    consent:
      "By continuing, I consent to my personal data processing according to Fetch's",
    termOfService: "Term of Service",
    privacyNotice: "Privacy Notice",
    slide1Title: "Welcome to Fetch!",
    slide1Body:
      "Your go-to app for a hassle-free life, we're here to help with all your needs!",
    slide2Title: "Rides around Bukidnon",
    slide2Body:
      "Hail a trip across town — the fare is shown before you even request, and your rider tracks live on the map.",
    slide3Title: "Pasugo and pabili",
    slide3Body:
      "Send a package to family, or have a rider fetch groceries and run errands for you.",
    slide4Title: "Fares you can trust",
    slide4Body:
      "Every price comes from the live tariff and is locked to your trip — what you see is what you pay.",
  },

  auth: {
    signIn: "Sign in",
    signUp: "Create account",
    email: "Email address",
    password: "Password",
    emailPlaceholder: "you@example.com",
    submitSignIn: "Sign in",
    submitSignUp: "Create account",
    orContinueWith: "or",
    title: "Sign in to Fetch",
    otpHint: "We send a six-digit code to your email. No passwords to remember.",
    sendCode: "Send code",
    passwordHint: "Sign in with the password on your account.",
    createHint:
      "Create your account with an email and a password — at least 10 characters, with a letter and a number. No code to wait for.",
    useEmailCode: "Use an email code instead",
    emailCode: "Email me a code",
    codeSent: "We sent a code to your email.",
    enterCode: "Enter the 6-digit code",
    checkEmail: "Check your email",
    sentTo: "Enter the six-digit code we sent to",
    verifyContinue: "Verify and continue",
    differentEmail: "Use a different email",
    verify: "Verify",
    guest: "Continue as guest",
    guestNote: "Guest sessions are handy for trying the rider and commuter flows side by side.",
    guestNoteShort: "No account, no password. Good for a quick look around.",
    signInWithPassword: "Sign in with a password",
    signInWithEmailCode: "Sign in with an email code",
    noAccount: "New to Fetch?",
  },

  onboarding: {
    step: "Step 1 of 1",
    title: "Welcome to Fetch",
    subtitle:
      "Tell us how to reach you and you can book your first ride.",
    commuter: "Booking rides",
    commuterHint:
      "Book a ride, see the fare up front, and track your rider live.",
    driveWithUs: "Want to drive instead?",
    driveWithUsHint:
      "Driving has its own registration — it asks for your vehicle before your application is sent.",
    name: "Full name",
    namePlaceholder: "Juan Dela Cruz",
    phone: "Mobile number",
    phonePlaceholder: "+63 917 000 0000",
    phoneHint:
      "Used so your rider or commuter can reach you during a trip. Never shown publicly.",
    submit: "Continue",
    signOut: "Sign out",
  },

  booking: {
    pickup: "Pickup",
    destination: "Destination",
    whereTo: "Where to?",
    whereFrom: "Where from?",
    searchHere: "Search here",
    chooseOnMap: "Choose on map",
    confirm: "Confirm",
    fare: "Fare",
    bookNow: "Request now",
    bookLater: "Book for later",
    cancel: "Cancel request",
  },

  trip: {
    searching: "Finding you a rider",
    accepted: "Your rider is on the way",
    arriving: "Your rider is arriving",
    arrived: "Your rider has arrived",
    inProgress: "On the way",
    completed: "Trip complete",
    cancelled: "Cancelled",
    chat: "Message",
    call: "Call",
    rate: "Rate your rider",
    receipt: "Receipt",
  },

  account: {
    title: "Your account",
    openMenu: "Open your account menu",
    phone: "Phone number",
    email: "Email address",
    notAdded: "Not added yet",
    changePassword: "Change password",
    signOut: "Sign out",
    signOutFailed:
      "We could not sign you out. Check your connection and try again.",
    emergency: "Emergency contact",
    photo: "Profile photo",
    emergencyHint:
      "If your rider cannot reach you during a trip, they can see this name and number while they are carrying you. Nobody else can.",
    theirName: "Their name",
    theirNumber: "Their number",
    saveContact: "Save contact",
    emergencySaved: "Emergency contact saved",
    passwordTitle: "Change your password",
    passwordRequest:
      "We will email a one-time code to your address. Enter it with your new password to confirm the change.",
    passwordVerify:
      "Enter the code we emailed you and choose a new password.",
    emailCodeAction: "Email me a code",
    codeLabel: "Code from your email",
    newPassword: "New password",
    passwordPlaceholder: "At least 10 characters, with a number",
    setNewPassword: "Set new password",
    codeFailed: "We could not send the code. Please try again.",
    codeRejected: "That code was not accepted. Check it and try again.",
    emergencyFailed: "We could not save that. Please check the number.",
    passwordChanged: "Password changed",
    passwordChangedHint:
      "Use your new password the next time you sign in.",
    emailNote:
      "We use your email for ride updates and your one-time sign-in codes.",
  },

  profile: {
    title: "My profile",
    account: "Your account",
    editDetails: "Edit your name and number",
    editDetailsHint:
      "This is how a rider introduces themselves on the trip, and the number we call if something goes wrong.",
    name: "Full name",
    namePlaceholder: "Juan dela Cruz",
    phone: "Mobile number",
    phonePlaceholder: "0917 000 0000",
    detailsSaved: "Your details were updated",
    detailsFailed: "We could not save that. Please check the number.",
    preferences: "Preferences",
    activity: "Your Fetch",
    others: "Others",
    accountSafety: "Account safety",
    accountSafetyHint: "Password",
    languageAppearance: "Language & appearance",
    help: "Help & support",
    helpHint: "We reply by email",
    supportEmail: "fetchbukidnon@gmail.com",
    footer: "FETCH · Bukidnon",
  },

  coverage: {
    title: "Where Fetch runs",
    intro:
      "Riders are on the road in two cities right now. Search and the map open across Bukidnon, but a request from anywhere else waits for a rider who is not there yet.",
    comingNext: "Coming next",
    comingNextHint:
      "These towns are on the map and in search, with no riders on the road yet. We turn them on one city at a time.",
    menuLabel: "Service area",
    menuHint: "Malaybalay and Valencia",
  },

  legal: {
    terms: "Terms of service",
    privacy: "Privacy policy",
  },

  setLocation: {
    pickupEyebrow: "Your pickup",
    destinationTitle: "Set the destination",
    findingAddress: "Finding the address…",
    findingYou: "Finding your location…",
    searchPlaceholder: "Search for a destination",
    editingHint:
      "Tap the map to move the pin to the gate or door you use.",
    tapToFix: "Tap the map to set the address",
    edit: "Edit",
    done: "Done",
    cancelEdit: "Cancel editing",
    useMyLocation: "Use my location",
    locatingLabel: "Finding your location…",
    currentLocationTitle: "Your current location",
    locatingCurrent: "Locating you…",
    detectedHere: "You are here",
    useCurrentLocation: "Use current location",
    retryLocation: "Try again",
    fallbackTitle: "Set your pickup another way",
    fallbackSearchPlaceholder: "Search for your pickup address",
    fallbackHint:
      "Search for your address above, or tap the map so you can place the pin yourself.",
    fixDriftWarning:
      "This pin is {m} m off from your GPS — make sure it sits on your gate.",
    nearbyResultsFallback: "Tap a numbered pin to pick it",
    saveAs: "Save {name}",
    heldPinTitle: "The pin was dropped here",
    heldPinLabel: "New pin",
    confirmHeldPin: "Set this as my destination",
    discardHeldPin: "Discard",
    recentHereTitle: "Recent on this phone",
    clearRecents: "Clear",
    recentTitle: "Recent",
    dragHint: "Drag the pin, or tap the map",
    draggingAddress: "Looking for the address…",
    etaLabel: "ETA",
    nearbyResults: "Tap a numbered pin to pick it",
    outsideArea:
      "That is outside our service area — we have riders on the road in {cities} right now. You can still book from here, but it may take longer to find a rider.",
    nextDestination: "Next — set your destination",
    nextReview: "Next — review your trip",
    skipToDestination: "Skip, then set the destination",
  },

  photo: {
    change: "Change profile photo",
    add: "Add profile photo",
    remove: "Remove photo",
    updated: "Your photo was updated",
    removed: "Your photo was removed",
    tooLarge: "That photo is too large.",
    pickSmaller: "Pick one under 5 MB.",
    wrongType: "Upload a JPEG, PNG or WebP image.",
  },

  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Check your connection and try again.",
  },
};

/**
 * The shape of a dictionary.
 *
 * Derived from the English object rather than written out by hand, so there is
 * exactly one place a key can be added — here — and every other language is
 * forced to carry it too.
 */
export type Dictionary = typeof en;