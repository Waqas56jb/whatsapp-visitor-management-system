import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Landing from './components/Landing';
import LoginScreen from './components/LoginScreen';
import PassView from './components/PassView';
import Portal from './components/Portal';
import { getClientToken } from './api/client';

function passTokenFromPath() {
  const match = window.location.pathname.match(/^\/pass\/([A-Za-z0-9]+)/);
  return match ? match[1] : '';
}

export default function App() {
  const [loginOn, setLoginOn] = useState(false);
  const [appOn, setAppOn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [passToken] = useState(() => passTokenFromPath());

  useEffect(() => {
    const savedUser = sessionStorage.getItem('botho_client_user');
    const token = getClientToken();
    if (savedUser && token) {
      const acc = JSON.parse(savedUser);
      setCurrentUser(acc);
      setAppOn(true);
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

  if (passToken) {
    return (
      <>
        <div id="glow"></div>
        <PassView token={passToken} />
      </>
    );
  }

  return (
    <>
      <div id="glow"></div>
      <Landing hidden={appOn} navLabel={currentUser ? 'Go to Dashboard' : 'Client Login'} onOpenLogin={() => setLoginOn(true)} />
      <LoginScreen on={loginOn} onClose={() => setLoginOn(false)} onSuccess={enterApp} />
      <Portal on={appOn} currentUser={currentUser} onBackToSite={backToSite} onToast={showToast} />
    </>
  );
}
