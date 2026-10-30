// HTTP helpers for the Sweed mock: JSON replies in the Ecom API's error shape ({ detail }) and a bounded body reader.

// An answer the mock sends as an error. The router turns it into a JSON reply with the same status.
export class ApiFailure extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

export const fail = (status, detail) => new ApiFailure(status, detail)

// Returned by a handler that answers 204 with no body.
export const NO_CONTENT = Symbol('no content')
export const created = (body) => ({ status: 201, body })

export function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

export function sendFailure(res, error) {
  const status = error instanceof ApiFailure ? error.status : 500
  const detail = error instanceof ApiFailure ? error.message : 'The mock store failed to answer this request.'
  sendJson(res, status, { status, title: status === 500 ? 'Internal error' : 'Request failed', detail })
}

// Reads a JSON body. An empty body is an empty object; anything over the limit or not JSON is refused.
export async function readJson(req, limit = 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw fail(413, 'Request body too large.')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw fail(400, 'Request body is not valid JSON.')
  }
}

// Whole-number query parameter with a default and an upper bound. Anything that is not a positive integer gets the default.
export function intParam(query, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(query.get(name))
  if (!Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, max)
}

export const money = (value) => Math.round(Number(value) * 100) / 100
