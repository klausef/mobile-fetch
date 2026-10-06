import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { initials } from "@/lib/account";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * The profile picture: tap to choose, tap again to change or remove.
 *
 * Built on Convex's own file storage rather than a third-party upload service.
 * The image is a few hundred kilobytes at most, it is only ever read by the
 * people on a trip, and keeping it inside the same deployment means no second
 * vendor to hold a credential for and no second place where a Bukidnon user's
 * photo lives.
 *
 * The upload goes straight from the browser to storage via a one-time URL, so
 * the bytes never pass through a Convex function.
 */

/** Mirrors MAX_PHOTO_BYTES in convex/profiles.ts. Checked here to fail fast. */
const MAX_BYTES = 5 * 1024 * 1024;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function PhotoPicker({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const photoUrl = useQuery(api.profiles.myPhotoUrl);
  const t = useT();
  const generateUploadUrl = useMutation(
    api.profiles.generatePhotoUploadUrl,
  );
  const setPhoto = useMutation(api.profiles.setPhoto);
  const removePhoto = useMutation(api.profiles.removePhoto);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires onChange.
    event.target.value = "";
    if (!file || busy) return;

    // Both checks are duplicated on the server. This copy exists to avoid
    // spending an upload on a file that is going to be rejected.
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t("photo", "wrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("photo", "tooLarge"), {
        description: t("photo", "pickSmaller"),
      });
      return;
    }

    setBusy(true);
    try {
      const url = await generateUploadUrl();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error("The upload did not finish. Please try again.");
      }
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setPhoto({ storageId });
      toast.success(t("photo", "updated"));
    } catch (err) {
      toast.error(errorMessage(err, "We could not upload that photo."));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await removePhoto();
      toast.success(t("photo", "removed"));
    } catch (err) {
      toast.error(errorMessage(err, "We could not remove that photo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={(e) => void onPick(e)}
        className="sr-only"
        aria-label={t("account", "photo")}
      />

      <div className="relative">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="size-12 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-fetch-red/10 text-base font-semibold text-fetch-red"
          >
            {initials(name)}
          </span>
        )}

        <button
          type="button"
          aria-label={photoUrl ? t("photo", "change") : t("photo", "add")}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-fetch-red text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Camera className="size-3" />
          )}
        </button>
      </div>

      {photoUrl ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void onRemove()}
          className="mt-2 h-8 px-2 text-xs text-muted-foreground"
        >
          <Trash2 className="size-3.5" />
          {t("photo", "remove")}
        </Button>
      ) : null}
    </div>
  );
}