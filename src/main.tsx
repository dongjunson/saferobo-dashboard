import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 애플리케이션은 다크 테마만 제공한다. 첫 렌더 전에 고정해 색상 깜빡임을 막는다.
document.documentElement.dataset.theme = 'dark'
document.documentElement.style.colorScheme = 'dark'
localStorage.removeItem('theme')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
