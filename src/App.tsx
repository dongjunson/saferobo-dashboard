import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ControlCenter from './pages/ControlCenter'
import Dashboard from './pages/Dashboard'
import Workers from './pages/Workers'
import Sensors from './pages/Sensors'
import Alerts from './pages/Alerts'

/* 맵 빌더는 three.js(Builder3D)를 포함하는 무거운 라우트 — 진입 시에만 로드.
 * 관제 3D(Site3D)도 SiteMap 내부에서 lazy라 메인 번들에는 three.js가 빠진다. */
const MapBuilder = lazy(() => import('./pages/MapBuilder'))
/* 비콘 배치 리포트 — Planning Worker 포함, 진입 시에만 로드 */
const BeaconReport = lazy(() => import('./pages/BeaconReport'))

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* 맵 빌더는 독립 전체화면 — Layout(사이드바·헤더) 밖에서 렌더링 */}
        <Route
          path="/map-builder"
          element={
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-page text-sm text-muted">
                  맵 빌더 로딩 중…
                </div>
              }
            >
              <MapBuilder />
            </Suspense>
          }
        />
        <Route
          path="/beacon-report"
          element={
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-page text-sm text-muted">
                  리포트 로딩 중…
                </div>
              }
            >
              <BeaconReport />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route path="/" element={<ControlCenter />} />
          <Route path="/stats" element={<Dashboard />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/sensors" element={<Sensors />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/realtime" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
