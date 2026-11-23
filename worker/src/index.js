// Worker entry. Only the default fetch/scheduled handler is exported here: newer workerd
// rejects extra named exports on the main module. Helpers for tests live in app.js.
import app from "./app.js";
export default app;
