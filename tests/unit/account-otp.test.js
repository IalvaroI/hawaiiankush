import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidOtp } from '../../src/features/account/otp.js'

describe('OTP validation', () => {
  it('accepts four-digit live codes and six-digit compatibility codes', () => {
    assert.equal(isValidOtp('4826'), true)
    assert.equal(isValidOtp('123456'), true)
    assert.equal(isValidOtp('12345'), true)
  })

  it('rejects codes shorter than four or longer than six digits', () => {
    assert.equal(isValidOtp('123'), false)
    assert.equal(isValidOtp('1234567'), false)
    assert.equal(isValidOtp('12a4'), false)
    assert.equal(isValidOtp(1234), false)
  })
})
