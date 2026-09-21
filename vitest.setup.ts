import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library does not auto-cleanup outside of the Jest globals
// environment, so unmount rendered trees explicitly after every test.
afterEach(() => {
  cleanup();
});
