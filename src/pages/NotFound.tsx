import { FetchBrand } from "@/components/FetchBrand";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="safe-bottom flex min-h-dvh flex-col bg-background text-foreground"
    >
      <header className="safe-top mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link to="/" className="rounded-md">
          <FetchBrand size="md" />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center">
          <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Off the route
          </p>
          <h1 className="mt-4 text-6xl font-semibold tracking-tight text-fetch-red sm:text-7xl">
            404
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            That page is not on any of our routes. If you were looking for a
            ride, the booking screen is one tap away.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="bg-fetch-red text-white hover:bg-fetch-red-deep">
              <Link to="/auth?returnTo=%2Fapp">
                Book a ride
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.main>
  );
}
