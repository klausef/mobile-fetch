/**
 * "Who is riding?" — the one booking step where the person paying and the
 * person riding can be different people.
 *
 * Everything else on the booking screen has one person in it: the pickup is
 * yours, the destination is yours, the fare is yours. This step breaks that
 * assumption, so it is asked explicitly rather than inferred. A rider arriving
 * at a pickup needs to know whose name to ask for and whose number to ring, and
 * those are only the same person if someone said so.
 *
 * ── Why "Myself" never asks for a name ──────────────────────────────────────
 * Asking a signed-in commuter to type their own name is a form that can only be
 * filled in wrong, and it invites a typo into the one field the rider will read
 * aloud at a busy junction. For "Myself" the name and number come from the
 * authenticated profile on the server, and this component shows them back as
 * confirmation rather than as an input.
 *
 * ── Why the passenger needs no account ──────────────────────────────────────
 * The whole point is booking for somebody who does not use Fetch. Nothing here
 * creates a profile or a login; it is two fields on one ride.
 *
 * Validation is duplicated on the server (`requestRide`), because this check is
 * a courtesy to the person typing and that one is the rule.
 */
import { useId } from "react";
import { AlertCircle, Phone, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  isValidPassengerPhone,
  MIN_PASSENGER_NAME,
  validatePassenger,
  type PassengerType,
  type WhoIsRidingValue,
} from "@/lib/passenger";

// Re-exported so a screen can hold the value without importing two modules for
// one type. The implementations live in `@/lib/passenger` because that is where
// the tests can reach them.
export { isValidPassengerPhone, MIN_PASSENGER_NAME, validatePassenger };
export type { PassengerType, WhoIsRidingValue };

/**
 * The signed-in person's own details, for the "Myself" confirmation line.
 *
 * Optional because the profile is a separate query: until it arrives the card
 * still works, it just cannot print the name yet.
 */
export type WhoIsRidingProfile = {
  name?: string | null;
  phone?: string | null;
} | null;

export function WhoIsRiding({
  value,
  onChange,
  profile,
  className,
}: {
  value: WhoIsRidingValue;
  onChange: (next: WhoIsRidingValue) => void;
  profile: WhoIsRidingProfile;
  className?: string;
}) {
  const nameId = useId();
  const phoneId = useId();
  const errors = validatePassenger(value);
  const isOther = value.passengerType === "other";

  const choose = (type: PassengerType) =>
    onChange({
      // Kept rather than cleared: switching back and forth should not make the
      // commuter retype somebody they already entered.
      ...value,
      passengerType: type,
    });

  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <p className="text-sm font-medium tracking-tight">Who is riding?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose who will be taking this ride.
        </p>
      </div>

      <div className="space-y-2.5" role="radiogroup" aria-label="Who is riding?">
        <ChoiceCard
          selected={!isOther}
          onSelect={() => choose("self")}
          icon={<User className="size-5" />}
          title="Myself"
          hint="I'm taking this ride"
        >
          {/* Confirmation, not an input. The commuter cannot mistype their own
              name onto their own ride, and the rider reads this back at the
              pickup. */}
          {!isOther && (profile?.name || profile?.phone) ? (
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
              {[profile?.name, profile?.phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </ChoiceCard>

        <ChoiceCard
          selected={isOther}
          onSelect={() => choose("other")}
          icon={<UserPlus className="size-5" />}
          title="Someone else"
          hint="I'm booking for another person"
        />
      </div>

      {isOther ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Passenger details
          </p>
          {/* The person riding, not the account paying. The wording keeps the
              two apart on screen so nobody assumes the number below is the
              booker's own. */}
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>Passenger full name</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={nameId}
                value={value.passengerName}
                onChange={(event) =>
                  onChange({ ...value, passengerName: event.target.value })
                }
                placeholder="Juan Dela Cruz"
                autoComplete="off"
                className={cn("pl-9", errors.name && "border-fetch-red")}
              />
            </div>
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={phoneId}>Passenger mobile number</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={phoneId}
                type="tel"
                inputMode="tel"
                value={value.passengerPhone}
                onChange={(event) =>
                  onChange({ ...value, passengerPhone: event.target.value })
                }
                placeholder="09XXXXXXXXX"
                autoComplete="off"
                className={cn("pl-9", errors.phone && "border-fetch-red")}
              />
            </div>
            {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground">
            They don't need a Fetch account. This is who your rider will meet,
            and the number they will call.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** One selectable card. Selected state carries a border and a tint, not colour alone. */
function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  hint,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-secondary/60",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium tracking-tight">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
        {children}
      </span>
      {/* A tick rather than a bare border, so the selection is legible to
          someone who cannot separate the two tints. */}
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary bg-primary" : "border-border",
        )}
        aria-hidden
      >
        {selected ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
      </span>
    </button>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-4 text-fetch-red">
      <AlertCircle className="mt-0.5 size-3 shrink-0" />
      {children}
    </p>
  );
}