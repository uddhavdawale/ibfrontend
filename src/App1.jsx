import React, { useState } from 'react';
import './App.css';

function App() {
  const [step, setStep] = useState(1);
  const [loanData, setLoanData] = useState({});

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  return (
    <div className="App">
      <header className="App-header">
        <h1> Inventory <br></br>And Billing Platform</h1>
      </header>
      <main>
        {step === 1 && <LoanApplicationForm nextStep={nextStep} setLoanData={setLoanData} loanData={loanData} />}
      /*  {step === 2 && <CibilCheck nextStep={nextStep} prevStep={prevStep} loanData={loanData} />}
        {step === 3 && <InsuranceOffer nextStep={nextStep} prevStep={prevStep} loanData={loanData} />}
        {step === 4 && <NbfcMatching loanData={loanData} />} */
      </main>
    </div>
  );
}

function LoanApplicationForm({ nextStep, setLoanData, loanData }) {
  const [formData, setFormData] = useState(loanData);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoanData(formData);
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

function CibilCheck({ nextStep, prevStep, loanData }) {
  // Simulate CIBIL API call
  const [cibilScore, setCibilScore] = useState(null);

  const checkCibil = () => {
    // Mock API call
    setTimeout(() => {
      const score = Math.floor(Math.random() * 300) + 300; // Random score 300-600
      setCibilScore(score);
    }, 2000);
  };

  return (
    <div>
      <h2>CIBIL Score Check</h2>
      <p>Checking CIBIL score for {loanData.name}...</p>
      {!cibilScore && <button onClick={checkCibil}>Check Score</button>}
      {cibilScore && (
        <div>
          <p>Your CIBIL Score: {cibilScore}</p>
          <p>Eligibility: {cibilScore > 350 ? 'Eligible' : 'May require insurance'}</p>
          <button onClick={prevStep}>Back</button>
          <button onClick={nextStep}>Next</button>
        </div>
      )}
    </div>
  );
}

function InsuranceOffer({ nextStep, prevStep, loanData }) {
  return (
    <div>
      <h2>Approval Insurance</h2>
      <p>For ₹3,000, we guarantee loan approval even if CIBIL is low.</p>
      <button onClick={prevStep}>Back</button>
      <button onClick={nextStep}>Opt for Insurance</button>
      <button onClick={nextStep}>Skip Insurance</button>
    </div>
  );
}

function NbfcMatching({ loanData }) {
  // Mock NBFC matching
  const nbfcs = ['NBFC A', 'NBFC B', 'NBFC C'];
  const matched = nbfcs[Math.floor(Math.random() * nbfcs.length)];

  return (
    <div>
      <h2>NBFC Matching</h2>
      <p>Based on your details, you are matched with: {matched}</p>
      <p>Loan Amount: ₹{loanData.loanAmount}</p>
      <p>Proceed to apply.</p>
    </div>
  );
}

export default App1;