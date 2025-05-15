async function handler({ context, event }) {
  const time = (/* @__PURE__ */ new Date()).toLocaleTimeString();
  console.log(`👋 Your Sanity Function was called at ${time}`);
}
export {
  handler
};
//# sourceMappingURL=index.js.map
