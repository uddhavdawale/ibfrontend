import React, { useState } from 'react';
import './App.css';
import Login from './Login/Login';
function App() {
  const [step, setStep] = useState(1);
  const [loginData, setLoginData] = useState({});

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="App">
      <header className="App-header">
        <h1> Inventory <br></br>And Billing Platform</h1>
      </header>
      <main>
        {step === 1 && <LoanApplicationForm nextStep={nextStep} setLoginData={setLoginData} loginData={loginData} />}
        {step === 2 && <NbfcMatching loanData={loanData} />} 
      </main>
    </div>
  );
}

function LoanApplicationForm({ nextStep, setLoginData, loginData }) {
  const [formData, setFormData] = useState(loginData);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
     setLoginData(formData);
    nextStep();
  };

  return (
    <div>
      <h2>Loan Application</h2>
      <form onSubmit={handleSubmit}>
        <input name="name" placeholder="Full Name" onChange={handleChange} required />
        <input name="pan" placeholder="PAN Number" onChange={handleChange} required />
        <input name="phone" placeholder="Phone Number" onChange={handleChange} required />
        <input name="loanAmount" type="number" placeholder="Loan Amount (₹)" onChange={handleChange} required />
        <button type="submit">Next</button>
      </form>
    </div>
  );
}






export default App