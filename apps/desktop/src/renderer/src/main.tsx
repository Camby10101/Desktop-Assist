import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BubbleView } from './views/BubbleView'
import { ClonesView } from './views/ClonesView'
import { PanelView } from './views/PanelView'

// Every overlay window loads this page; the query string says which one this is.
const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'bubble' ? <BubbleView /> : view === 'clones' ? <ClonesView /> : <PanelView />}
  </StrictMode>,
)
