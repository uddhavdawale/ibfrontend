import React, { useState } from 'react';
import LoginForm from './components/Login/Login';
import VerificationStep from './components/Verification/Verification';
import SecurityCheck from './components/Security/SecurityCheck';
import DashboardEntry from './components/Dashboard/DashboardEntry';
import './App.css';

function App() {
  const [step, setStep] = useState(1);
  const [loginData, setLoginData] = useState({});

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Inventory & <br />Billing Platform</h1>
        <p>Stock Management | Billing | Reports</p>
      </header>
      <main className="app-main">
        {step === 1 && <LoginForm nextStep={nextStep} setLoginData={setLoginData} loginData={loginData} />}
        {step === 2 && <VerificationStep nextStep={nextStep} prevStep={prevStep} loginData={loginData} />}
        {step === 3 && <SecurityCheck nextStep={nextStep} prevStep={prevStep} loginData={loginData} />}
        {step === 4 && <DashboardEntry loginData={loginData} />}
      </main>
    </div>
  );
}

export default App;
