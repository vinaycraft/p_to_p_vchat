import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Landing from './Landing';
import VideoChat from './VideoChat';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<VideoChat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
