import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { View } from '@shared/views'
import './styles.css'
import { BattleView } from './views/BattleView'
import { BubbleView } from './views/BubbleView'
import { ClonesView } from './views/ClonesView'
import { FamiliarView } from './views/FamiliarView'
import { PanelView } from './views/PanelView'
import { ScreenSaverView } from './views/ScreenSaverView'
import { SpellView } from './views/SpellView'
import { TrickView } from './views/TrickView'
import { VisionView } from './views/VisionView'

/** Each kind of window's page (shared/views.ts): every overlay window loads this page. */
const PAGES: Record<View, ComponentType> = {
  bubble: BubbleView,
  panel: PanelView,
  clones: ClonesView,
  vision: VisionView,
  spell: SpellView,
  screensaver: ScreenSaverView,
  familiar: FamiliarView,
  trick: TrickView,
  battle: BattleView,
}

// The query string says which window this is; the panel if it doesn't say (or says something else).
const view = new URLSearchParams(window.location.search).get('view')
const Page = (view && PAGES[view as View]) || PanelView

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
