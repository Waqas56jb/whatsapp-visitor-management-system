import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Landing from './components/Landing';
import LoginScreen from './components/LoginScreen';
import PassView from './components/PassView';
import Portal from './components/Portal';
import Validator from './components/Validator';
import { getClientToken } from './api/client';
import { LanguageProvider } from './i18n';

function routeFromPath() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/validate' || path === '/gate') return { type: 'validate' };
  const match = path.match(/^\/pass\/([A-Za-z0-9]+)/);
  if (match) return { type: 'pass', token: match[1] };
  // Link sent to hosts on WhatsApp: open sign-in (or the dashboard) straight on Visit requests.
  if (path === '/portal' || path === '/requests') return { type: 'app', portal: true };
  return { type: 'app' };
}

export default function App() {
  const [loginOn, setLoginOn] = useState(false);
  const [appOn, setAppOn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [route] = useState(() => routeFromPath());

  useEffect(() => {
    const savedUser = sessionStorage.getItem('botho_client_user');
    const token = getClientToken();
    if (savedUser && token) {
      const acc = JSON.parse(savedUser);
      setCurrentUser(acc);
      setAppOn(true);
    } else if (route.portal) {
      setLoginOn(true);
    }
  }, []);

  function showToast(msg, isErr) {
    if (isErr) toast.error(msg);
    else toast.success(msg);
  }

  function enterApp(acc) {
    setCurrentUser(acc);
    setLoginOn(false);
    setAppOn(true);
  }

  function backToSite() {
    setAppOn(false);
    window.scrollTo(0, 0);
  }

  if (route.type === 'validate') {
    return (
      <>
        <div id="glow"></div>
        <Validator />
      </>
    );
  }

  if (route.type === 'pass') {
    return (
      <>
        <div id="glow"></div>
        <PassView token={route.token} />
      </>
    );
  }

  return (
    <LanguageProvider user={currentUser?.username}>
      <div id="glow"></div>
      <Landing hidden={appOn} navLabel={currentUser ? 'Go to Dashboard' : 'Client Login'} onOpenLogin={() => setLoginOn(true)} />
      <LoginScreen on={loginOn} onClose={() => setLoginOn(false)} onSuccess={enterApp} />
      <Portal
        on={appOn}
        currentUser={currentUser}
        initialView={route.portal ? 'requests' : 'overview'}
        onBackToSite={backToSite}
        onToast={showToast}
      />
    </LanguageProvider>
  );
}
