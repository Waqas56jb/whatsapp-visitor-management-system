import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './console.css';
import App from './App.jsx';
import PassPage from './components/PassPage.jsx';
import { LanguageProvider } from './i18n';

// /pass/<token> is the visitor's public pass page (the link in the WhatsApp QR); every other
// path is the admin panel, which starts at the login screen.
const passToken = window.location.pathname.match(/^\/pass\/([^/?#]+)/)?.[1];

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider user="admin">{passToken ? <PassPage token={decodeURIComponent(passToken)} /> : <App />}</LanguageProvider>
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
