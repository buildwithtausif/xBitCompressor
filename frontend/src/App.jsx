import Navbar from './Navbar.jsx'
import LandingPage from './LandingPage.jsx'
import { useState } from 'react'
import SettingsPage from './SettingsPage.jsx'
import DownloadsPage from './DownloadsPage.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { Toaster } from 'sonner'

function App() {
  const phases = Object.freeze({
    LANDING: 'landing',
    SETTINGS: 'settings',
    DOWNLOADS: 'downloads'
  })
  const [phase, setPhase] = useState(phases.LANDING);
  const [batchItems, setBatchItems] = useState([]);
  const [compressing, setCompressing] = useState(false);

  const resetBatch = () => {
    batchItems.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      // Release compressed blob reference
      item.compressedBlob = null;
    });
    setBatchItems([]);
    setPhase(phases.LANDING);
  };

  const renderSwitch = (phase) => {
    switch(phase) {
      case phases.LANDING:
        return (
          <LandingPage
            batchItems={batchItems}
            setBatchItems={setBatchItems}
            setPhase={setPhase}
          />
        );
      case phases.SETTINGS:
        return (
          <SettingsPage
            batchItems={batchItems}
            setBatchItems={setBatchItems}
            setPhase={setPhase}
            resetBatch={resetBatch}
            compressing={compressing}
            setCompressing={setCompressing}
          />
        );
      case phases.DOWNLOADS:
        return (
          <DownloadsPage
            batchItems={batchItems}
            setBatchItems={setBatchItems}
            setPhase={setPhase}
            resetBatch={resetBatch}
          />
        );
    }
  }

  return (
    <div className="bg-background text-text h-[100dvh] min-h-[100dvh] flex flex-col overflow-hidden">
      <Navbar setPhase={setPhase} resetBatch={resetBatch} compressing={compressing} />
      <Toaster richColors position="top-center" />
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <ErrorBoundary>
          <div
            key={phase}
            className="h-full animate-fadeIn"
          >
            {renderSwitch(phase)}
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
