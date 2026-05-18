import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SettingsPage } from './pages/SettingsPage'
import { EditorWindow } from './features/fs/components/EditorWindow'
import './assets/globals.css'
import '@xterm/xterm/css/xterm.css'


const root = ReactDOM.createRoot(document.getElementById('root')!)
const hash = window.location.hash

if (hash === '#settings') {
  root.render(<SettingsPage />)
} else if (hash === '#editor') {
  root.render(<EditorWindow />)
} else {
  root.render(<App />)
}
