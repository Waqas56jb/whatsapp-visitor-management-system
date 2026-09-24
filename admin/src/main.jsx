import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { LanguageProvider } from './i18n';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider user="admin">
      <App />
    </LanguageProvider>
    <ToastContainer
      position="top-right"
      autoClose={3200}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnHover
      draggable
      theme="dark"
      toastClassName="botho-toast"
    />
  </StrictMode>
);
