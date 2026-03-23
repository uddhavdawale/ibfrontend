import React, { useState } from 'react';
import './Verification.css';

function VerificationStep({ nextStep, prevStep, loginData }) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      nextStep();
    }, 1500);
  };

  return (
    <div className="verification-container">
      <h2>Verify Email</h2>
      <p>Enter OTP sent to {loginData.email}</p>
      <form onSubmit={handleVerify}>
        <input 
          type="text" 
          placeholder="Enter 6-digit OTP" 
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          required 
          className="otp-input"
        />
        <button type="submit" disabled={isVerifying} className="verify-btn">
          {isVerifying ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>
      <button onClick={prevStep} className="back-btn">Back</button>
    </div>
  );
}

export default VerificationStep;
