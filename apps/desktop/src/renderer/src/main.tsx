import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { BubbleView } from './views/BubbleView'
import { ClonesView } from './views/ClonesView'
import { FamiliarView } from './views/FamiliarView'
import { BattleView } from './views/BattleView'
import { TrickView } from './views/TrickView'
import { PanelView } from './views/PanelView'
import { ScreenSaverView } from './views/ScreenSaverView'
import { SpellView } from './views/SpellView'
import { VisionView } from './views/VisionView'

// Every overlay window loads this page; the query string says which one this is.
const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'bubble' ? (
      <BubbleView />
    ) : view === 'clones' ? (
      <ClonesView />
    ) : view === 'vision' ? (
      <VisionView />
    ) : view === 'spell' ? (
      <SpellView />
    ) : view === 'screensaver' ? (
      <ScreenSaverView />
    ) : view === 'familiar' ? (
      <FamiliarView />
    ) : view === 'trick' ? (
      <TrickView />
    ) : view === 'battle' ? (
      <BattleView />
    ) : (
      <PanelView />
    )}
  </StrictMode>,
)
