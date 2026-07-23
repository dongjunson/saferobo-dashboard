import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  CloudSun,
  Cpu,
  Droplets,
  LayoutDashboard,
  Map as MapIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Sun,
  Users,
  Wind,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { siteInfo } from '../data/site'

const NAV_GROUPS: Array<{
  title?: string
  items: Array<{ to: string; label: string; icon: ReactNode }>
}> = [
  {
    items: [
      { to: '/', label: '통합 관제', icon: <Radio size={20} /> },
      { to: '/stats', label: '통계 대시보드', icon: <LayoutDashboard size={20} /> },
    ],
  },
  {
    title: '현황 관리',
    items: [
      { to: '/workers', label: '작업자 현황', icon: <Users size={20} /> },
      { to: '/sensors', label: 'IoT 센서/장비', icon: <Cpu size={20} /> },
      { to: '/alerts', label: '알림 이력', icon: <Bell size={20} /> },
    ],
  },
  {
    title: '도구',
    items: [{ to: '/map-builder', label: '맵 빌더', icon: <MapIcon size={20} /> }],
  },
]

const PAGE_META: Record<string, [string, string]> = {
  '/': [siteInfo.name, 'GIS 기반 실시간 위치·상태 통합 관제'],
  '/stats': ['통계 대시보드', '현장 안전 현황을 한눈에 확인하세요'],
  '/workers': ['작업자 현황', '입실 작업자의 위치와 상태를 확인하세요'],
  '/sensors': ['IoT 센서/장비', '게이트웨이·비콘·센서 상태를 관리하세요'],
  '/alerts': ['알림 이력', '가스·심박·SOS 알림 이력을 조회하세요'],
}

const REFRESH_INTERVAL = 30

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/* 시계·새로고침 카운트다운을 격리 — 매초 리렌더링이 이 컴포넌트에서 멈춘다 */
function HeaderClock() {
  const now = useClock()
  const refreshLeft = REFRESH_INTERVAL - (Math.floor(now.getTime() / 1000) % REFRESH_INTERVAL)
  return (
    <>
      <span className="whitespace-nowrap text-sm text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {now.toLocaleString('ko-KR', {
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </span>
      <span
        className="whitespace-nowrap rounded-[8px] bg-surface-2 px-2 py-1 text-xs text-ink-2"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        새로고침 : {refreshLeft}
      </span>
    </>
  )
}

/* SafeRobo DS: 사이드바는 라이트 모드에서도 다크 틴트 유지.
 * open=false면 아이콘 전용 레일로 접힌다 (토글 상태는 localStorage 보존) */
function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-white/5 bg-[#1e293b] transition-[width] duration-200 ${
        open ? 'w-60' : 'w-[68px]'
      }`}
    >
      <div className={`pt-5 pb-4 ${open ? 'px-5' : 'px-0'}`}>
        <div className={`flex items-center ${open ? 'justify-between gap-2' : 'flex-col gap-2.5'}`}>
          <div className={`flex items-center ${open ? 'gap-2.5' : ''}`}>
            <img src="/android-chrome-192x192.png" alt="SAFEROBO" className="h-7 w-7 rounded-[8px]" />
            {open && <span className="text-lg font-extrabold tracking-tight text-white">SAFEROBO</span>}
          </div>
          <button
            onClick={onToggle}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={open ? '메뉴 접기' : '메뉴 펼치기'}
            title={open ? '메뉴 접기' : '메뉴 펼치기'}
          >
            {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
        </div>
        {open && <p className="mt-2 text-xs text-slate-500">스마트 안전관제</p>}
      </div>
      <nav className={`flex-1 overflow-y-auto ${open ? 'px-3' : 'px-2.5'}`}>
        {NAV_GROUPS.map((g, i) => (
          <div key={i} className={i > 0 ? 'mt-5' : ''}>
            {g.title &&
              (open ? (
                <p className="mb-2 px-4 text-xs font-bold text-slate-500">{g.title}</p>
              ) : (
                <div className="mx-2 mb-2 border-t border-white/10" />
              ))}
            <div className="space-y-1">
              {g.items.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={label}
                  className={({ isActive }) =>
                    `flex w-full items-center rounded-[14px] py-3 min-h-11 text-base font-medium transition-colors ${
                      open ? 'gap-3.5 px-4' : 'justify-center px-0'
                    } ${
                      isActive
                        ? 'bg-[#3b82f6] text-white shadow-sm'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                    }`
                  }
                >
                  <span className="h-5 w-5 shrink-0">{icon}</span>
                  {open && label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={`border-t border-white/5 ${open ? 'p-4' : 'p-3'}`}>
        <div
          className={`flex items-center ${open ? 'gap-3' : 'justify-center'}`}
          title="김안전 · 안전관리자 · 군포 하수도 사업소"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3b82f6] font-bold text-white">
            김
          </div>
          {open && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-100">김안전</p>
              <p className="mt-0.5 truncate text-xs leading-tight text-slate-500">
                안전관리자 · 군포 하수도 사업소
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default function Layout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark',
  )
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem('nav-open') !== '0')
  const location = useLocation()
  const [title, subtitle] = PAGE_META[location.pathname] ?? ['', '']
  const w = siteInfo.weather

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleNav = () =>
    setNavOpen((v) => {
      localStorage.setItem('nav-open', v ? '0' : '1')
      return !v
    })

  return (
    <div className="flex h-full bg-page">
      <Sidebar open={navOpen} onToggle={toggleNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-40 flex min-h-[72px] shrink-0 items-center justify-between border-b border-hairline bg-surface-1/80 px-5 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* 현장 기후 (레거시 헤더 날씨 클러스터) */}
            <div className="hidden items-center gap-3 whitespace-nowrap rounded-[10px] border border-hairline px-3 py-1.5 text-sm text-ink-2 xl:flex">
              <span className="flex items-center gap-1.5">
                <CloudSun size={16} className="text-s3" />
                {w.condition} {w.temp}°C
              </span>
              <span className="flex items-center gap-1 text-muted">
                <Wind size={13} />
                {w.wind}m/s
              </span>
              <span className="flex items-center gap-1 text-muted">
                <Droplets size={13} />
                {w.humidity}%
              </span>
              <span className="text-muted">
                PM10 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{w.pm10}</span>
              </span>
            </div>
            <span className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-good" />
              </span>
              실시간 수신 중
            </span>
            <HeaderClock />
            <div className="hidden h-8 w-px bg-hairline md:block" />
            <button
              className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-[14px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="알림"
            >
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-critical" />
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-[14px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="테마 전환"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
