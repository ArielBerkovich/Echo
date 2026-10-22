export function acknowledgeSocket(ack, response) {
  if (typeof ack !== "function") return false;
  try {
    ack(response);
    return true;
  } catch {
    return false;
  }
}

export function isPlainSocketPayload(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function safeSocketHandler(eventName, handler, { objectPayload = false, onFailure = () => {} } = {}) {
  return (...args) => {
    const hasAckArgument = args.length > 1;
    const ack = typeof args.at(-1) === "function" ? args.at(-1) : undefined;
    const fail = (error) => {
      try { onFailure(eventName, error); } catch { /* failure reporting must not escape the socket boundary */ }
      acknowledgeSocket(ack, { error: "could not process event" });
    };

    try {
      if (objectPayload && !isPlainSocketPayload(args[0])) {
        fail(new TypeError("socket event payload must be an object"));
        return undefined;
      }
      if (hasAckArgument && !ack) {
        fail(new TypeError("socket acknowledgement must be a function"));
        return undefined;
      }
      const result = handler(...args);
      if (result && typeof result.then === "function") return Promise.resolve(result).catch(fail);
      return result;
    } catch (error) {
      fail(error);
      return undefined;
    }
  };
}
