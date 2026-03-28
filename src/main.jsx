import React from 'react'
import ReactDOM from 'react-dom/client'
//import App from './App.jsx'
import Login from './Login/Login.jsx'
import './index.css'
import Dashboard from './Dashboard/DashboardEntry.jsx'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './AppRouter.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>

  
   
     <BrowserRouter>
       <AppRoutes />
    </BrowserRouter>
   
  </React.StrictMode>,
)