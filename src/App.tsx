import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ControlCenter from './pages/ControlCenter'
import Dashboard from './pages/Dashboard'
import Workers from './pages/Workers'
import Sensors from './pages/Sensors'
import Alerts from './pages/Alerts'
import MapBuilder from './pages/MapBuilder'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* 맵 빌더는 독립 전체화면 — Layout(사이드바·헤더) 밖에서 렌더링 */}
        <Route path="/map-builder" element={<MapBuilder />} />
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
