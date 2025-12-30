import { BrowserRouter, Routes, Route } from 'react-router-dom'
import FirstTimeEntry from './routes/FirstTimeEntry'
import SignalEntry from './routes/SignalEntry'
import StoryEntry from './routes/StoryEntry'
import SignalsView from './routes/SignalsView'
import StoriesView from './routes/StoriesView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* First-time user entry points */}
        <Route path="/" element={<FirstTimeEntry />} />
        
        {/* QR code entry points */}
        <Route path="/signal/:id" element={<SignalEntry />} />
        <Route path="/story/:id" element={<StoryEntry />} />
        
        {/* Layer routes: Signals (Tripdar) */}
        <Route path="/signals/:scale" element={<SignalsView />} />
        
        {/* Layer routes: Stories (Triptales) */}
        <Route path="/stories/:scale" element={<StoriesView />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

