async function withOriginalUrl(request, handler) {
  const routedUrl = request.url;
  request.url = request.originalUrl || request.url;

  try {
    await handler();
  } finally {
    request.url = routedUrl;
  }
}

function legacyRoute(handler) {
  return (request, response, next) => {
    withOriginalUrl(request, () => handler(request, response, next)).catch(next);
  };
}

export { legacyRoute, withOriginalUrl };
