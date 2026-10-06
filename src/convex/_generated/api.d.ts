/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_password from "../auth/password.js";
import type * as chat from "../chat.js";
import type * as http from "../http.js";
import type * as lib_adminEmail from "../lib/adminEmail.js";
import type * as lib_audience from "../lib/audience.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_broadcast from "../lib/broadcast.js";
import type * as lib_chat from "../lib/chat.js";
import type * as lib_db from "../lib/db.js";
import type * as lib_fare from "../lib/fare.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_passenger from "../lib/passenger.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_provider from "../lib/provider.js";
import type * as lib_recent from "../lib/recent.js";
import type * as notifications from "../notifications.js";
import type * as profiles from "../profiles.js";
import type * as ratings from "../ratings.js";
import type * as recentPlaces from "../recentPlaces.js";
import type * as riders from "../riders.js";
import type * as rides from "../rides.js";
import type * as savedPlaces from "../savedPlaces.js";
import type * as tariffs from "../tariffs.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/password": typeof auth_password;
  chat: typeof chat;
  http: typeof http;
  "lib/adminEmail": typeof lib_adminEmail;
  "lib/audience": typeof lib_audience;
  "lib/auth": typeof lib_auth;
  "lib/broadcast": typeof lib_broadcast;
  "lib/chat": typeof lib_chat;
  "lib/db": typeof lib_db;
  "lib/fare": typeof lib_fare;
  "lib/geo": typeof lib_geo;
  "lib/limits": typeof lib_limits;
  "lib/passenger": typeof lib_passenger;
  "lib/password": typeof lib_password;
  "lib/provider": typeof lib_provider;
  "lib/recent": typeof lib_recent;
  notifications: typeof notifications;
  profiles: typeof profiles;
  ratings: typeof ratings;
  recentPlaces: typeof recentPlaces;
  riders: typeof riders;
  rides: typeof rides;
  savedPlaces: typeof savedPlaces;
  tariffs: typeof tariffs;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
