import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useHashRoute } from './hooks/useHashRoute';
import { pageVariants } from './lib/transitions';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Today } from './pages/Today';
import { History } from './pages/History';
import { AppLoading } from './components/AppLoading';
import { VersionBadge } from './components/VersionBadge';
import { UpdateBanner } from './components/UpdateBanner';
import { Analytics } from '@vercel/analytics/react';

function App() {
  const { session, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const reducedMotion = useReducedMotion();
  const { isDark, toggle: toggleTheme } = useTheme(session?.user.id ?? null);
  const hash = useHashRoute();

  // The initial auth check can't be skipped, but which screen it resolves to
  // is genuinely unknown until it does — showing Today's skeleton as a guess
  // means a logged-out visitor sees the wrong screen flash before Landing.
  // A neutral loading screen has no wrong guess to make.
  const screen = loading ? 'loading' : session ? (hash === '#/history' ? 'history' : 'today') : showAuth ? 'auth' : 'landing';

  // Note: Today's fixed-position overlays (FAB, add-task modal, compare duel,
  // morning flow) are portaled to document.body so the page-transition
  // transform on .screen-frame never becomes their containing block.
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen}
          className="screen-frame"
          variants={reducedMotion ? undefined : pageVariants}
          initial="initial"
          animate="enter"
          exit="exit"
        >
          {screen === 'loading' && <AppLoading />}
          {screen === 'today' && session && <Today session={session} isDark={isDark} toggleTheme={toggleTheme} />}
          {screen === 'history' && session && <History />}
          {screen === 'auth' && <Auth onBack={() => setShowAuth(false)} />}
          {screen === 'landing' && <Landing onGetStarted={() => setShowAuth(true)} />}
        </motion.div>
      </AnimatePresence>
      <UpdateBanner />
      <VersionBadge />
      <Analytics />
    </>
  );
}

export default App;
