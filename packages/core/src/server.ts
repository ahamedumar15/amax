// Server-only surface: services, audit, tenancy. Kept out of the root export so client bundles
// that import manifests never pull in the database driver or node:crypto.
export { authorize, contextFor, ForbiddenError, setAuthorizer, type Actor, type Authorizer, type ServiceContext, type Source } from "./authorize";
export { canonical, redact, verifyAuditChain, type ChainResult, type Sensitivity } from "./audit";
export { configureRuntime, defineService, ValidationError, type Emitted, type Runtime, type ServiceOutcome, type ServiceSpec } from "./service";
export * as coreSchema from "./schema";
