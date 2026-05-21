import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Landing from './Landing';
import Login from './Login';
import VideoChat from './VideoChat';
import ProtectedRoute from './ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <VideoChat />
            </ProtectedRoute>
          }
        />
        <Route path="/auth/callback" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
