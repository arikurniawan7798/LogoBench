import type { Store } from "./storage.js";
import type { Provider } from "./ai/provider.js";
import type { ProjectService } from "./projects.js";
import type { Limits } from "./limits.js";

export type AppContext = { store: Store; getProvider: () => Promise<Provider>; projects: ProjectService; limits: Limits };
