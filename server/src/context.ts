import type { Store } from "./storage.js";
import type { Provider } from "./ai/provider.js";
import type { ProjectService } from "./projects.js";
import type { Limits } from "./limits.js";
import type { FontFetcher } from "./identity/fonts.js";

/** fontFetcher: injectable fetch used to download Google Fonts for the identity bundle (tests pass a fake; default is global fetch). */
export type AppContext = { store: Store; getProvider: () => Promise<Provider>; projects: ProjectService; limits: Limits; fontFetcher?: FontFetcher };
