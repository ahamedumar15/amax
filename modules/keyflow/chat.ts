export const chatIntents = [
  { id: "keyflow.connect", label: "Connect Keyflow", tool: "connect_keyflow", required: ["endpoint"],
    fields: [{ name: "endpoint", ask: "What is your Keyflow address? It starts with https://." }] },
];
