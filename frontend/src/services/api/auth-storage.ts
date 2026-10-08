import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@convex-dev/auth/react";

/**
 * Where Convex Auth keeps its tokens on a phone.
 *
 * The browser default is `localStorage`; a native app has no such thing, and
 * Convex Auth asks for an explicit store on React Native. SecureStore is the
 * right one: the refresh token is a bearer credential, and on Android
 * `localStorage`-equivalents are plain files any backup can read.
 *
 * The three methods are exactly the `TokenStorage` interface — kept to
 * `async`/`await` rather than the sync API the browser uses, which is why the
 * interface itself allows promises.
 */
export const secureStoreTokenStorage: TokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
