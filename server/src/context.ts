import type { Store } from "./storage.js";

export type AppContext = { store: Store; getProvider: () => unknown };
