import type { Store } from "./storage.js";
import type { ProjectService } from "./projects.js";

export type AppContext = { store: Store; getProvider: () => unknown; projects: ProjectService };
