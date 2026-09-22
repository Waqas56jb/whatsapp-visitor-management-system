import { useEffect, useState } from 'react';
import Landing from './components/Landing';
import LoginScreen from './components/LoginScreen';
import Portal from './components/Portal';
import Toast from './components/Toast';
import { getClientToken } from './api/client';

export default function App() {
  const [loginOn, setLoginOn] = useState(false);
  const [appOn, setAppOn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [toasts, setToasts] = useState([]);

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
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, msg, isErr }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
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

  return (
    <>
      <div id="glow"></div>
      <Landing hidden={appOn} navLabel={currentUser ? 'Go to Dashboard' : 'Client Login'} onOpenLogin={() => setLoginOn(true)} />
      <LoginScreen on={loginOn} onClose={() => setLoginOn(false)} onSuccess={enterApp} />
      <Portal on={appOn} currentUser={currentUser} onBackToSite={backToSite} onToast={showToast} />
      <Toast toasts={toasts} />
    </>
  );
}
