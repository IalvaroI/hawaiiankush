// Sweed's live Ecom API issued a valid 4-digit email OTP; keep 6-digit compatibility for test/other issuers.
export const isValidOtp = (value) => typeof value === 'string' && /^\d{4,6}$/.test(value)
