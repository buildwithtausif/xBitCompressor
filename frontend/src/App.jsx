import Navbar from './Navbar.jsx'
import LandingPage from './LandingPage.jsx'
import './App.css'
import { useState } from 'react'
import SettingsPage from './SettingsPage.jsx'
import DownloadsPage from './DownloadsPage.jsx'
import { Toaster } from 'sonner'

function App() {
  const phases = Object.freeze({
    LANDING: 'landing',
    SETTINGS: 'settings',
    DOWNLOADS: 'downloads'
  })
  const [phase, setPhase] = useState(phases.LANDING);
  const [image, setImage] = useState(null)
  const [compressedImage, setCompressedImage] = useState(null);
  const renderSwitch = (phase) => {
  switch(phase) {
    case phases.LANDING:
      return <LandingPage setImage={setImage} setPhase={setPhase}/>;
    case phases.SETTINGS:
      return <SettingsPage image={image} setCompressedImage={setCompressedImage} setImage={setImage} setPhase={setPhase}/>;
    case phases.DOWNLOADS:
      return <DownloadsPage image={image} compressedImage={compressedImage} setPhase={setPhase}/>
  }
}
  return (
    <div className="bg-background text-text fixed inset-0 flex flex-col overflow-hidden">
      
      <Navbar setPhase={setPhase} />
      <Toaster richColors/>
      <main className="flex-1 min-h-0 overflow-y-auto">
        {renderSwitch(phase)}
      </main>
    </div>
  )
}

export default App
