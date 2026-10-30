import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { requestPasswordCode, savePassword } from './accountApi.js'
import { Alert, Notice } from './AccountFrame.jsx'
import { ResetForm } from './ResetForm.jsx'
import { failureText } from './accountRules.js'

// Create or change the account password. A code goes to the account email first; the password is set with that code.
export function PasswordSection({ user, onChanged }) {
  const email = user.login?.value || ''
  const [stage, setStage] = useState('idle')
  const [resendAt, setResendAt] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function start() {
    setError('')
    setNotice('')
    setStage('sending')
    try {
      const { expiresAt } = await requestPasswordCode(email)
      setResendAt(expiresAt)
      setStage('form')
    } catch (err) {
      setError(failureText(err, "We couldn't send a code. Try again."))
      setStage('idle')
    }
  }

  async function save(otp, password) {
    await savePassword({ email, otp, password })
    setStage('idle')
    setNotice(user.hasPassword ? 'Password changed.' : 'Password created.')
    onChanged()
  }

  return (
    <>
      <h2 id="acct-password">Password</h2>
      <p className="acct-muted">
        {user.hasPassword
          ? 'A password is set. You can sign in with it, or with a code.'
          : 'No password is set. You sign in with a code. Create a password for faster sign-in.'}
      </p>
      {notice && <Notice>{notice}</Notice>}
      {error && <Alert>{error}</Alert>}
      {stage !== 'form' && (
        <div className="acct-actions">
          <button className="secondary-button" type="button" onClick={start} disabled={stage === 'sending'}>
            {stage === 'sending' && <Loader2 className="spin" size={16} aria-hidden="true" />}
            {stage === 'sending' ? 'Sending code...' : user.hasPassword ? 'Change password' : 'Create a password'}
          </button>
        </div>
      )}
      {stage === 'form' && (
        <ResetForm
          idPrefix="account-password"
          email={email}
          initialResendAt={resendAt}
          onResend={() => requestPasswordCode(email).then((result) => result.expiresAt)}
          onSubmit={save}
          onBack={() => setStage('idle')}
          submitLabel={user.hasPassword ? 'Change password' : 'Create password'}
        />
      )}
    </>
  )
}
