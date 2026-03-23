import React from 'react';
function SecurityCheck({ nextStep, prevStep, loginData }) {
  return (
    <div className="security-container">
      <h2>Security Check</h2>
      <p>Device verified for {loginData.email}</p>
      <button onClick={nextStep}>Continue</button>
      <button onClick={prevStep}>Back</button>
    </div>
  );
}
export default SecurityCheck;
