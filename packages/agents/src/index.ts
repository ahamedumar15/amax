// Safe for manifests: declaring a kind pulls in no database code. Services live in @amax/agents/server.
export { defineSuggestionKind, type KindWrite, type SuggestionKind, type SuggestionScope } from "./kinds";
