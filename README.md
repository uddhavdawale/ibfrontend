# EV Loan Guarantee Platform

A React application that pre-screens EV bike loan applications using CIBIL API, offers approval insurance for ₹3k fee, and matches customers to NBFCs.

## Features

- Loan Application Form
- CIBIL Score Check (simulated)
- Approval Insurance Offer
- NBFC Matching

## Getting Started

1. Install Node.js (https://nodejs.org/)
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open http://localhost:5173 in your browser

## Frontend logging

Use the shared logger from `src/utils/logger.js` instead of calling `console` directly:

```js
import logger from './utils/logger';

logger.info('Action completed');
logger.error('Request failed', error);
```

Development defaults to `debug`; production defaults to `warn`. Set `VITE_LOG_LEVEL` to `debug`, `info`, `warn`, `error`, or `silent` to override the level. The logger redacts common credentials and personal fields before writing to the browser console.

## Business Model

- Pre-screen loans to reduce rejections
- Offer insurance for ₹3,000 to guarantee approval
- Match to NBFCs for funding
- Target: 1,000 customers at 75% success rate for ₹12L profit
