// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import { password } from "./auth/password";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // `password` added for email+password sign-in (owner/admin account and any
  // rider who prefers a password). `emailOtp` remains the default flow.
  providers: [emailOtp, password, Anonymous],
});