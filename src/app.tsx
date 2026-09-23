import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const LandingPage = lazy(() => import('./pages/Landing/LandingPage'));
const IntroPage = lazy(() => import('./pages/Intro/IntroPage'));
const QuizPage = lazy(() => import('./pages/Quiz/QuizPage'));
const ResultPage = lazy(() => import('./pages/Result/ResultPage'));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-brand-500">
      加载中…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </Suspense>
  );
}
